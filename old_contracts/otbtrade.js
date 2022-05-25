
const cadmin = "otb_admin";
const tradingFee = 0.002;
const discount = 0.25;

class Exchange {
    init() {

    }

    can_update(data) {
        return blockchain.requireAuth(blockchain.contractOwner(), "active");
    }

    updateInit() {
        this._assertAccountAuth(blockchain.contractOwner());
        this._addLPContractStarts("Contract2ssM7avvDNM5ev1ynfJanY4VdZrw1p5zK4eBhFm7P7RE")

    }

    _addLPContractStarts(contract) {
        //let id = storage.get("lpID") * 1;
        let newID = 60; //metx previous
        storage.put("lpID", newID.toString());
        
        storage.mapPut("lpcontractIDs", contract, newID.toString());
        storage.put("lpID" + contract, newID.toString());
    }

    _generateLPID(contract) {

        let id = storage.get("lpID" + contract) * 1;
        let newID = id + 1;
        storage.put("lpID" + contract, newID.toString());
        return id.toString();
    }

    _checkContract() {
        let hasContract = false;

        let lpkeys = JSON.parse(storage.globalGet("Contract9b4Qf7SKxSH1dbofDBtSPhCc9Joy9MdV5G4ECus6SeKs", "liquidityPairKeys"));

        lpkeys.forEach(contractid => {
            if (blockchain.requireAuth(contractid, "active")) {
                hasContract = true;
            }
        });

        if (!hasContract) {
            throw "Only LP Contract can update"
        }
    }

    _addTicket(account) {
        blockchain.callWithAuth("Contract9b4Qf7SKxSH1dbofDBtSPhCc9Joy9MdV5G4ECus6SeKs",
            "addTicket",
            JSON.stringify([account])
        );
    }
 
    listToken(tokenSymbol, decimal, contract) {
        blockchain.callWithAuth("token.iost", "totalSupply", JSON.stringify([tokenSymbol]));

        if (storage.mapHas("tokens", tokenSymbol)) {
            throw "Token is already listed.";
        }

        if (tokenSymbol === "iost") {
            throw "Cannot add IOST as a token. ";
        }

        if ((contract === 'token.iost' || contract.includes("Contract")) !== true) {
            throw "You don't have a valid contract. "
        }

        let arr = JSON.parse(storage.get("tokensInfo"));

        if (tx.publisher === cadmin) {
            arr.push({ symbol: tokenSymbol, contract: contract, official: true });
        }
        else {
            arr.push({ symbol: tokenSymbol, contract: contract, official: false });
        }

        storage.mapPut("tokens", tokenSymbol, decimal, tx.publisher);
        storage.put("tokensInfo", JSON.stringify(arr), tx.publisher);
        storage.mapPut("tokensContracts", tokenSymbol, contract, tx.publisher);

        this._initKeysForOrderBooks(tokenSymbol);
    }

    buyDiscount(otbTokens) {
        if (otbTokens * 0 !== 0) {
            throw "Otbc amount must be a valid number and not a string. ";
        }

        if (otbTokens < 1) {
            throw "Total otbc value must be greater than or equivalent to 1. ";
        }

        if (otbTokens % 1 > 0) {
            throw "Total otbc value must be a whole number. ";
        }

        let args = [
            "otbc",
            tx.publisher,
            'ContractEDKpT81h35S895typgQbSzg4nXnCZued5UuQMoPRycab',
            (otbTokens * 0.8).toString(),
            "User bought discount vouchers from otbTrade. "
        ];

        blockchain.callWithAuth("token.iost", "transfer", JSON.stringify(args));

        let args2 = [
            "otbc",
            tx.publisher,
            'otb_dev',
            (otbTokens * 0.2).toString(),
            "User bought discount vouchers from otbTrade. "
        ];

        blockchain.callWithAuth("token.iost", "transfer", JSON.stringify(args2));

        let vouchers = 10 * otbTokens;
        if (!storage.mapHas(tx.publisher, "discounts")) {
            storage.mapPut(tx.publisher, "discounts", vouchers.toString());
        } else {
            let totalVouchers =
                storage.mapGet(tx.publisher, "discounts") * 1 + vouchers;
            storage.mapPut(tx.publisher, "discounts", totalVouchers.toString());
        }
    }

    _tradeFeesDiscount(account) {
        if (
            !storage.mapGet(account, "discounts") ||
            storage.mapGet(account, "discounts") <= 0
        ) {
            return tradingFee;
        } else {
            let vouchers = storage.mapGet(account, "discounts") * 1 - 1;
            storage.mapPut(account, "discounts", vouchers.toString());
            return tradingFee * (1 - discount);
        }
    }


    _checkReferral(referee, account) {
        let args = JSON.stringify([referee, account]);
        let ref = JSON.parse(blockchain.callWithAuth("Contract9b4Qf7SKxSH1dbofDBtSPhCc9Joy9MdV5G4ECus6SeKs", "checkReferral", args));

        if (ref === null) {
            return null;
        }

        storage.mapPut("account", account, JSON.stringify(ref));
        return ref.referredBy;
    }

    _checkOrder(tokenSymbol, price, amount) {
        if (!storage.mapHas("tokens", tokenSymbol)) {
            throw "This token is not listed.";
        }

        if (tokenSymbol === "iost") {
            throw "iost/iost is not a valid trade pair. ";
        }

        if (price * 0 !== 0 || amount * 0 !== 0) {
            throw "Price and amount must be a valid number and not a string. ";
        }

        if (price * amount < 10) {
            throw "Total iost trade value must be greater than 10. ";
        }

        if (price * 1 <= 0 || amount * 1 <= 0) {
            throw "Price and amount must be greater than zero. ";
        }

        
    }

    buyToken(tokenSymbol, price, amount, referee) {
        this._checkOrder(tokenSymbol, price, amount);
        
        if (!storage.mapHas(tx.publisher, tokenSymbol)) {
            storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify([]));
        }

        let userOrders = JSON.parse(storage.mapGet(tx.publisher, tokenSymbol));

        if (userOrders.length === 50) {
            throw "You exceeded the max orders for this token.  ";
        }

        let tokenDecimal = storage.mapGet("tokens", tokenSymbol);

        let buyerFee = this._tradeFeesDiscount(tx.publisher) * 1;
        let totalAmountIostNecessary = amount * price;
        let fee = totalAmountIostNecessary * buyerFee;

        let fixedAmount = (amount * 1).toFixed(tokenDecimal);
        let iostFixed = (price * 1).toFixed(8);

        let referredBy = this._checkReferral(referee, tx.publisher);

        let order = this._createOrder(
            tx.publisher,
            tokenSymbol,
            fixedAmount,
            iostFixed,
            true,
            buyerFee.toFixed(8),
            referredBy
        );

        this._transferToken(
            "iost",
            tx.publisher,
            blockchain.contractName(),
            (totalAmountIostNecessary + fee).toFixed(8)
        );


        userOrders.push(order.orderID);
        storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify(userOrders));

        storage.mapPut("orders", order.orderID, JSON.stringify(order));
        return order.orderID;
    }

    _adjustToken(tokenSymbol, amount){
        if(tokenSymbol === "per"){
            return (amount * .98).toFixed(8);
        }
        else {
            return amount;
        }
    }

    sellToken(tokenSymbol, price, amount, referee) {
        this._checkOrder(tokenSymbol, price, amount);

        if (!storage.mapHas(tx.publisher, tokenSymbol)) {
            storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify([]));
        }

        

        let userOrders = JSON.parse(storage.mapGet(tx.publisher, tokenSymbol));

        if (userOrders.length === 50) {
            throw "You exceeded the max orders for this token.  ";
        }

        let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

        let sellerFee = this._tradeFeesDiscount(tx.publisher) * 1;

        this._transferToken(
            tokenSymbol,
            tx.publisher,
            blockchain.contractName(),
            (amount * 1).toFixed(tokenDecimal)
        );

        amount = this._adjustToken(tokenSymbol, amount);
        
        let referredBy = this._checkReferral(referee, tx.publisher);

        let order = this._createOrder(
            tx.publisher,
            tokenSymbol,
            (amount * 1).toFixed(tokenDecimal),
            (price * 1).toFixed(8),
            false,
            sellerFee.toFixed(8),
            referredBy
        );

        userOrders.push(order.orderID);
        storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify(userOrders));

        storage.mapPut("orders", order.orderID, JSON.stringify(order));
        return order.orderID;
    }

    liquidityOrder(tokenSymbol, price, amount, isBuy, contract) {
        this._checkContract();
        this._checkOrder(tokenSymbol, price, amount);
        let userOrders = [];

        if (storage.mapHas(contract, tokenSymbol)) {
            userOrders = JSON.parse(storage.mapGet(contract, tokenSymbol));
        }

        if (userOrders.length === 50) {
            throw "You exceeded the max orders for this token.  ";
        }

        let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

        let order = this._createOrder(
            contract,
            tokenSymbol,
            (amount * 1).toFixed(tokenDecimal),
            (price * 1).toFixed(8),
            isBuy,
            "0.002",
            "otbtrade"
        );

        userOrders.push(order.orderID);
        storage.mapPut(contract, tokenSymbol, JSON.stringify(userOrders));

        storage.mapPut("orders", order.orderID, JSON.stringify(order));
    }

    cancelLiquidity(contractid, tokenSymbol) {
        this._checkContract();

        if (storage.mapHas(contractid, tokenSymbol)) {
            let userOrders = JSON.parse(storage.mapGet(contractid, tokenSymbol));
            if (userOrders.length) {
                userOrders.forEach(o => {
                    let order = JSON.parse(storage.mapGet("orders", o));
                    this._delOrder(order, tokenSymbol)

                })
            }

            
        }

        storage.put("lpID" + contractid, storage.mapGet("lpcontractIDs", contractid));
        
    }

    cancelOrder(orderID) {
        let order = JSON.parse(storage.mapGet("orders", orderID));

        if (order.orderStatus == "cancelled" || order.orderStatus == "completed") {
            throw "This orders is already cancelled or completed. ";
        }

        if (order.account !== tx.publisher) {
            throw "You are not authorized to cancel this order. ";    
        }

        let totalIostRefund = order.amount * order.price * (1 + order.fee * 1);

        if (order.isBuy == false) {

            if ((order.amount * 1).toFixed(8) > 0) {
                this._transferToken(
                    order.symbol,
                    blockchain.contractName(),
                    order.account,
                    (order.amount * 1)
                        .toFixed(storage.mapGet("tokens", order.symbol) * 1)
                        .toString()
                );
            }

        }
        else {
            if (totalIostRefund.toFixed(8) > 0) {
                this._transferToken(
                    "iost",
                    blockchain.contractName(),
                    order.account,
                    totalIostRefund.toFixed(8).toString()
                );
            }

        }

        order.orderStatus = "cancelled";
        order.updatedTime = block.time;
        this._delOrder(order, order.symbol);

        let order_type;
        if (order.isBuy == true) {
            order_type = "buy";
        } else {
            order_type = "sell";
        }

        blockchain.receipt(
            JSON.stringify({
                txType: "user-record",
                orderType: order_type,
                orderID: order.orderID,
                symbol: order.symbol,
                user: order.account,
                price: order.price,
                amount: order.currentFullfilled,
                time: block.time,
                volume: 0,
                status: order.orderStatus,
                order: order
            })
        );
    }

    _initKeysForOrderBooks(tokenSymbol) {
        storage.mapPut("buyOrders", tokenSymbol + ":priceKeys", JSON.stringify([]));
        storage.mapPut(
            "sellOrders",
            tokenSymbol + ":priceKeys",
            JSON.stringify([])
        );
    }

    _handleFees(fees) {
        let lotteryPool = storage.get("lotteryPool") * 1;
        let otbTeam = storage.get("otbTeam") * 1;

        lotteryPool += fees / 2;
        otbTeam += fees / 2;

        storage.put("lotteryPool", lotteryPool.toFixed(8));
        storage.put("otbTeam", otbTeam.toFixed(8));
    }

    handleTrade(orderID) {
        this._assertAccountAuth(cadmin);

        if (!storage.mapHas("orders", orderID)) {
            throw "Order does not exist. ";
        }

        let order = JSON.parse(storage.mapGet("orders", orderID));

        if (order.orderStatus !== "pending") {
            throw "Order has already been handled. ";
        }
        order.orderStatus = "opened";

        let tokenSymbol = order.symbol;
        let price = order.price * 1;
        let fee = order.fee * 1;
        let referee = order.referee;

        if (order.isBuy) {
            let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

            if (this._checkNewBuyGTESellLowest(tokenSymbol, price)) {
                let sellPrices = JSON.parse(
                    storage.mapGet("sellOrders", tokenSymbol + ":priceKeys")
                );
                let counter = 0;
                let orderAmount = order.amount * 1;
                let leftOver = order.amount * order.price * (1 + fee);
                let sellOrders = [];

                while (
                    counter < sellPrices.length &&
                    price >= sellPrices[counter] &&
                    orderAmount > 0
                ) {
                    let priceContainer = JSON.parse(
                        storage.mapGet(
                            "sellOrders",
                            tokenSymbol +
                            ":" +
                            sellPrices[counter].toFixed(8)
                        )
                    );
                    let priceAmount = priceContainer.amount * 1;
                    let priceOrders = priceContainer.orders;

                    sellOrders = sellOrders.concat(priceOrders);
                    orderAmount -= priceAmount;
                    counter++;
                }

                let amountNecessary = order.amount * 1;
                let newCounter = 0;

                while (
                    amountNecessary > 0 &&
                    newCounter < sellOrders.length &&
                    price >=
                    JSON.parse(storage.mapGet("orders", sellOrders[newCounter])).price *
                    1
                ) {
                    let sOrder = JSON.parse(
                        storage.mapGet("orders", sellOrders[newCounter])
                    );

                    let sOrderIOST = (sOrder.price * sOrder.amount).toFixed(8);
                    let sellReferee = sOrder.referee;
                    let vol = 0;

                    if (sOrder.amount <= amountNecessary) {
                        this._addTicket(sOrder.account);

                        let yourFee = (sOrderIOST * fee).toFixed(8);
                        let sellFee = (sOrderIOST * sOrder.fee).toFixed(8);

                        this._checkTransfer(order.account, "iost", sOrder.account, (sOrderIOST * 1 - sellFee * 1).toFixed(8), "User receives IOST. ");
           
                        leftOver -= (sOrderIOST * 1 + yourFee * 1);

                        vol += sOrder.amount * 1;

                        this._checkTransfer(sOrder.account, tokenSymbol, order.account, (sOrder.amount * 1).toFixed(tokenDecimal), "User receives token. ");

                        this._feeHandler(order.account, sOrder.account, referee, sellReferee, yourFee, sellFee);

                        amountNecessary -= sOrder.amount * 1;

                        sOrder.currentFullfilled = (
                            sOrder.currentFullfilled * 1 +
                            sOrder.amount * 1
                        ).toFixed(8);
                        sOrder.updatedTime = block.time;
                        sOrder.orderStatus = "completed";

                        this._delOrder(sOrder, tokenSymbol);
                        sOrder.amount = "0";

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "price-action",
                                orderType: "buy",
                                orderID: sOrder.orderID,
                                symbol: sOrder.symbol,
                                user: sOrder.account,
                                price: sOrder.price,
                                amount: vol.toString(),
                                time: block.time,
                                volume: vol,
                                status: sOrder.orderStatus,
                                order: sOrder
                            })
                        );

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "user-record",
                                orderType: "sell",
                                orderID: sOrder.orderID,
                                symbol: sOrder.symbol,
                                user: sOrder.account,
                                price: sOrder.price,
                                amount: sOrder.currentFullfilled,
                                time: block.time,
                                volume: vol,
                                status: sOrder.orderStatus,
                                order: sOrder
                            })
                        );
                    } else {
                        let yourFee = (amountNecessary * sOrder.price * fee).toFixed(8);
                        let sellFee = (amountNecessary * sOrder.price * sOrder.fee).toFixed(8);

                        this._checkTransfer(sOrder.account, tokenSymbol, order.account, amountNecessary.toFixed(tokenDecimal), "User receives token. ");

           
                        this._checkTransfer(order.account, "iost", sOrder.account, (amountNecessary * sOrder.price - sellFee * 1).toFixed(8), "User receives iost. ");


                        leftOver -= (amountNecessary * sOrder.price + yourFee * 1);
                        this._feeHandler(order.account, sOrder.account, referee, sellReferee, yourFee, sellFee);

                        vol += amountNecessary;

                        sOrder.currentFullfilled = (
                            sOrder.currentFullfilled * 1 +
                            amountNecessary
                        ).toFixed(8);
                        sOrder.amount = (sOrder.amount * 1 - amountNecessary).toFixed(8);
                        sOrder.updatedTime = block.time;

                        this._updateOrder(tokenSymbol, sOrder, amountNecessary);

                        amountNecessary = 0;

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "price-action",
                                orderType: "buy",
                                orderID: sOrder.orderID,
                                symbol: sOrder.symbol,
                                user: sOrder.account,
                                price: sOrder.price,
                                amount: vol.toString(),
                                time: block.time,
                                volume: vol,
                                status: sOrder.orderStatus,
                                order: sOrder
                            })
                        );

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "user-record",
                                orderType: "sell",
                                orderID: sOrder.orderID,
                                symbol: sOrder.symbol,
                                user: sOrder.account,
                                price: sOrder.price,
                                amount: sOrder.currentFullfilled,
                                time: block.time,
                                volume: vol,
                                status: sOrder.orderStatus,
                                order: sOrder
                            })
                        );
                    }

                    newCounter++;
                }

                if ((leftOver - (amountNecessary * price * (1 + fee))).toFixed(8) * 1 > 0) {
                    if (!this._isLPContract(order.account)) {
                        this._transferToken(
                            "iost",
                            blockchain.contractName(),
                            order.account,
                            (leftOver - (amountNecessary * price * (1 + fee))).toFixed(8)
                        );
                    }
                    
                }

                order.currentFullfilled = (
                    order.initialAmount * 1 -
                    amountNecessary
                ).toFixed(8);
                order.amount = amountNecessary.toFixed(8);
                order.updatedTime = block.time;

                if (order.amount * 1 === 0) {
                    order.orderStatus = "completed";
                    this._addTicket(order.account);

                    this._delOrder(order, tokenSymbol);
                } else {
                    this._updateOrder(tokenSymbol, order, amountNecessary * -1);
                }
            } else {
                this._checkNewBuyExists(tokenSymbol, order);
            }
        } else {
            let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

            if (this._checkNewSellLTEBuyHighest(tokenSymbol, price)) {

                let buyPrices = JSON.parse(
                    storage.mapGet("buyOrders", tokenSymbol + ":priceKeys")
                );
                let counter = 0;
                let orderAmount = order.amount * 1;
                let buyOrders = [];

                while (
                    counter < buyPrices.length &&
                    price <= buyPrices[counter] &&
                    orderAmount > 0
                ) {
                    let priceContainer = JSON.parse(
                        storage.mapGet(
                            "buyOrders",
                            tokenSymbol +
                            ":" +
                            buyPrices[counter].toFixed(8)
                        )
                    );
                    let priceAmount = priceContainer.amount * 1;
                    let priceOrders = priceContainer.orders;

                    buyOrders = buyOrders.concat(priceOrders);
                    orderAmount -= priceAmount;
                    counter++;
                }

                let amountNecessary = order.amount * 1;
                let newCounter = 0;

                while (
                    amountNecessary > 0 &&
                    newCounter < buyOrders.length &&
                    price <=
                    JSON.parse(storage.mapGet("orders", buyOrders[newCounter])).price *
                    1
                ) {
                    let bOrder = JSON.parse(
                        storage.mapGet("orders", buyOrders[newCounter])
                    );
                    let bOrderIOST = bOrder.price * bOrder.amount;
                    let buyReferee = bOrder.referee;
                    let vol = 0;

                    if (bOrder.amount <= amountNecessary) {
                        this._addTicket(bOrder.account);

                        let buyFee = (bOrderIOST * bOrder.fee).toFixed(8);
                        let yourFee = (bOrderIOST * fee).toFixed(8);

                        this._checkTransfer(bOrder.account, "iost", order.account, (bOrderIOST - yourFee * 1).toFixed(8), "User receives iost. ");

                        this._checkTransfer(order.account, tokenSymbol, bOrder.account, (bOrder.amount * 1).toFixed(tokenDecimal), "User receives token. ");

                        this._feeHandler(order.account, bOrder.account, referee, buyReferee, yourFee, buyFee);

                        amountNecessary -= bOrder.amount * 1;

                        vol += bOrder.amount * 1;

                        bOrder.currentFullfilled = (
                            bOrder.currentFullfilled * 1 +
                            bOrder.amount * 1
                        ).toFixed(8);
                        bOrder.updatedTime = block.time;
                        bOrder.orderStatus = "completed";

                        this._delOrder(bOrder, tokenSymbol);
                        bOrder.amount = "0";

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "price-action",
                                orderType: "sell",
                                orderID: bOrder.orderID,
                                symbol: bOrder.symbol,
                                user: bOrder.account,
                                price: bOrder.price,
                                amount: vol.toString(),
                                time: block.time,
                                volume: vol,
                                status: bOrder.orderStatus,
                                order: bOrder
                            })
                        );

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "user-record",
                                orderType: "buy",
                                orderID: bOrder.orderID,
                                symbol: bOrder.symbol,
                                user: bOrder.account,
                                price: bOrder.price,
                                amount: bOrder.currentFullfilled,
                                time: block.time,
                                volume: vol,
                                status: bOrder.orderStatus,
                                order: bOrder
                            })
                        );
                    } else {
                        let buyFee = (amountNecessary * bOrder.price * bOrder.fee).toFixed(8);
                        let yourFee = (amountNecessary * bOrder.price * fee).toFixed(8);

                        this._checkTransfer(order.account, tokenSymbol, bOrder.account, amountNecessary.toFixed(8), "User receives token. ");
                        this._checkTransfer(bOrder.account, "iost", order.account, (amountNecessary * bOrder.price - yourFee * 1).toFixed(8), "User receives iost. ");


                        this._feeHandler(order.account, bOrder.account, referee, buyReferee, yourFee, buyFee);

                        vol += amountNecessary;

                        bOrder.currentFullfilled = (
                            bOrder.currentFullfilled * 1 +
                            amountNecessary
                        ).toFixed(8);
                        bOrder.amount = (bOrder.amount * 1 - amountNecessary * 1).toFixed(8);
                        bOrder.updatedTime = block.time;

                        this._updateOrder(tokenSymbol, bOrder, amountNecessary);
                        amountNecessary = 0;

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "price-action",
                                orderType: "sell",
                                orderID: bOrder.orderID,
                                symbol: bOrder.symbol,
                                user: bOrder.account,
                                price: bOrder.price,
                                amount: vol.toString(),
                                time: block.time,
                                volume: vol,
                                status: bOrder.orderStatus,
                                order: bOrder
                            })
                        );

                        blockchain.receipt(
                            JSON.stringify({
                                txType: "user-record",
                                orderType: "buy",
                                orderID: bOrder.orderID,
                                symbol: bOrder.symbol,
                                user: bOrder.account,
                                price: bOrder.price,
                                amount: bOrder.currentFullfilled,
                                time: block.time,
                                volume: vol,
                                status: bOrder.orderStatus,
                                order: bOrder
                            })
                        );


                    }

                    newCounter++;
                }

                order.currentFullfilled = (
                    order.initialAmount * 1 -
                    amountNecessary
                ).toFixed(8);
                order.amount = amountNecessary.toFixed(8);
                order.updatedTime = block.time;

                if (order.amount * 1 === 0) {
                    order.orderStatus = "completed";
                    this._addTicket(order.account);
                    this._delOrder(order, tokenSymbol);
                } else {
                    this._updateOrder(tokenSymbol, order, amountNecessary * -1);
                }
            } else {
                this._checkNewSellExists(tokenSymbol, order);
            }
        }

        let order_type;
        if (order.isBuy == true) {
            order_type = "buy";
        } else {
            order_type = "sell";
        }

        blockchain.receipt(
            JSON.stringify({
                txType: "user-record",
                orderType: order_type,
                orderID: order.orderID,
                symbol: order.symbol,
                user: order.account,
                price: order.price,
                amount: order.currentFullfilled,
                time: block.time,
                volume: 0,
                status: order.orderStatus,
                order: order
            })
        );
    }

    _feeHandler(user1, user2, yourRef, otherRef, yourFee, otherFee) {

        if (yourFee * 1 > 0) {

            if (yourRef !== null && yourRef !== "null") {
                this._checkTransfer(user1, "iost", yourRef, (yourFee * 0.25).toFixed(8), "User sends fee to reference")

                yourFee = (yourFee * 0.75).toFixed(8);
            }
        }

        if (otherFee * 1 > 0) {

            if (otherRef !== null && otherRef !== "null") {
                this._checkTransfer(user2, "iost", otherRef, (otherFee * 0.25).toFixed(8), "User sends fee to reference")
                otherFee = (otherFee * 0.75).toFixed(8);
            }
        }


        if ((otherFee / 2 + yourFee / 2).toFixed(8) * 1 > 0) {
            this._checkTransfer(user1, "iost", "otb_dev", (yourFee / 2).toFixed(8), "User sends fee to dev. ");
            this._checkTransfer(user1, "iost", "otblottery", (yourFee / 2).toFixed(8), "User sends fee to lottery. ");
            this._checkTransfer(user2, "iost", "otb_dev", (otherFee / 2).toFixed(8), "User sends fee to dev. ");
            this._checkTransfer(user2, "iost", "otblottery", (otherFee / 2).toFixed(8), "User sends fee to lottery. ");

        }

    }

    _checkNewBuyGTESellLowest(tokenSymbol, buyPrice) {
        let sellPrices = JSON.parse(
            storage.mapGet("sellOrders", tokenSymbol + ":priceKeys")
        );

        if (!sellPrices.length) {
            return false;
        }

        if (buyPrice * 1 >= sellPrices[0]) {
            return true;
        }

        return false;
    }

    _checkNewSellLTEBuyHighest(tokenSymbol, sellPrice) {
        let buyPrices = JSON.parse(
            storage.mapGet("buyOrders", tokenSymbol + ":priceKeys")
        );

        if (!buyPrices.length) {
            return false;
        }

        if (sellPrice * 1 <= buyPrices[0]) {
            return true;
        }

        return false;
    }

    _checkNewBuyExists(tokenSymbol, buyOrder) {
        let buyPrices = JSON.parse(
            storage.mapGet("buyOrders", tokenSymbol + ":priceKeys")
        );

        if (!buyPrices.length || !buyPrices.includes(buyOrder.price * 1)) {
            buyPrices.push(buyOrder.price * 1);
            let sortePrices = buyPrices.sort(function (a, b) {
                return b - a;
            });
            storage.mapPut(
                "buyOrders",
                tokenSymbol + ":priceKeys",
                JSON.stringify(sortePrices)
            );
            storage.mapPut(
                "buyOrders",
                tokenSymbol +
                ":" +
                (buyOrder.price * 1).toFixed(8),
                JSON.stringify({
                    amount: (buyOrder.amount * 1),
                    orders: [buyOrder.orderID]
                })
            );
        } else {
            let json = JSON.parse(
                storage.mapGet(
                    "buyOrders",
                    tokenSymbol +
                    ":" +
                    (buyOrder.price * 1).toFixed(8)
                )
            );
            json.amount = json.amount * 1 + buyOrder.amount * 1;
            json.orders.push(buyOrder.orderID);
            storage.mapPut(
                "buyOrders",
                tokenSymbol +
                ":" +
                (buyOrder.price * 1).toFixed(8),
                JSON.stringify(json)
            );
        }

        storage.mapPut("orders", buyOrder.orderID, JSON.stringify(buyOrder));
    }

    _checkNewSellExists(tokenSymbol, sellOrder) {
        let sellPrices = JSON.parse(
            storage.mapGet("sellOrders", tokenSymbol + ":priceKeys")
        );

        if (!sellPrices.length || !sellPrices.includes(sellOrder.price * 1)) {
            sellPrices.push(sellOrder.price * 1);
            let sortePrices = sellPrices.sort(function (a, b) {
                return a - b;
            });
            storage.mapPut(
                "sellOrders",
                tokenSymbol + ":priceKeys",
                JSON.stringify(sortePrices)
            );
            storage.mapPut(
                "sellOrders",
                tokenSymbol +
                ":" +
                (sellOrder.price * 1).toFixed(8),
                JSON.stringify({
                    amount: (sellOrder.amount * 1),
                    orders: [sellOrder.orderID]
                })
            );
        } else {
            let json = JSON.parse(
                storage.mapGet(
                    "sellOrders",
                    tokenSymbol +
                    ":" +
                    (sellOrder.price * 1).toFixed(8)
                )
            );
            json.amount = json.amount * 1 + sellOrder.amount * 1;
            json.orders.push(sellOrder.orderID);
            storage.mapPut(
                "sellOrders",
                tokenSymbol +
                ":" +
                (sellOrder.price * 1).toFixed(8),
                JSON.stringify(json)
            );
        }

        storage.mapPut("orders", sellOrder.orderID, JSON.stringify(sellOrder));
    }

    _delOrder(order, tokenSymbol) {
        let price = order.price * 1;
        let amount = order.amount * 1;
        let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

        let userOrders = JSON.parse(storage.mapGet(order.account, tokenSymbol));

        userOrders = userOrders.filter(function (o) {
            return o !== order.orderID;
        });

        let orderType;

        if (order.isBuy) {
            orderType = "buyOrders";
        } else {
            orderType = "sellOrders";
        }

        if (
            storage.mapHas(
                orderType,
                tokenSymbol + ":" + price.toFixed(8)
            )
        ) {
            let priceOrder = JSON.parse(
                storage.mapGet(
                    orderType,
                    tokenSymbol + ":" + price.toFixed(8)
                )
            );

            priceOrder.amount = priceOrder.amount * 1 - amount * 1;

            priceOrder.orders = priceOrder.orders.filter(function (or) {
                return or !== order.orderID;
            });

            if ((priceOrder.amount * 1).toFixed(tokenDecimal) <= 0) {
                let pKeys = JSON.parse(
                    storage.mapGet(orderType, tokenSymbol + ":priceKeys")
                );
                pKeys = pKeys.filter(function (k) {
                    return k !== price;
                });

                storage.mapPut(
                    orderType,
                    tokenSymbol + ":priceKeys",
                    JSON.stringify(pKeys)
                );

                storage.mapDel(
                    orderType,
                    tokenSymbol + ":" + price.toFixed(8)
                );
            } else {
                storage.mapPut(
                    orderType,
                    tokenSymbol + ":" + price.toFixed(8),
                    JSON.stringify(priceOrder)
                );
            }
        }

        storage.mapPut(order.account, tokenSymbol, JSON.stringify(userOrders));
        storage.mapDel("orders", order.orderID);
    }

    _updateOrder(tokenSymbol, order, amountNecessary) {
        let tokenDecimal = storage.mapGet('tokens', tokenSymbol) * 1;
        order.amount = (order.amount * 1).toFixed(tokenDecimal);
        storage.mapPut("orders", order.orderID, JSON.stringify(order));

        let orderType;

        if (order.isBuy) {
            orderType = "buyOrders";
        } else {
            orderType = "sellOrders";
        }

        if (
            storage.mapHas(
                orderType,
                tokenSymbol + ":" + (order.price * 1).toFixed(8)
            )
        ) {
            let priceOrder = JSON.parse(
                storage.mapGet(
                    orderType,
                    tokenSymbol + ":" + (order.price * 1).toFixed(8)
                )
            );

            priceOrder.orders = priceOrder.orders.filter(or => or !== order.orderID);

            priceOrder.orders.push(order.orderID);

            priceOrder.orders = priceOrder.orders.sort(function (a, b) {
                return a.orderID - b.orderID;
            });

            priceOrder.amount = (priceOrder.amount * 1).toFixed(tokenDecimal) - (amountNecessary * 1).toFixed(tokenDecimal);

            storage.mapPut(
                orderType,
                tokenSymbol + ":" + (order.price * 1).toFixed(8),
                JSON.stringify(priceOrder)
            );
        } else {
            let pKeys = JSON.parse(
                storage.mapGet(orderType, tokenSymbol + ":priceKeys")
            );
            pKeys.push(order.price * 1);

            if (order.isBuy) {
                pKeys = pKeys.sort(function (a, b) { return b - a });
            }
            else {
                pKeys = pKeys.sort(function (a, b) { return a - b });
            }

            storage.mapPut(
                orderType,
                tokenSymbol + ":priceKeys",
                JSON.stringify(pKeys)
            );

            storage.mapPut(
                orderType,
                tokenSymbol + ":" + (order.price * 1).toFixed(8),
                JSON.stringify({ amount: (order.amount * 1).toFixed(tokenDecimal), orders: [order.orderID] })
            );
        }
    }

    _assertAccountAuth(account) {
        if (!blockchain.requireAuth(account, "active")) {
            throw "Authorization Failure";
        }
    }


    _createOrder(account, tokenSymbol, amount, price, isBuy, fee, referee) {
        let orderID = null;
        let dateTime = block.time;

        let lpkeys = JSON.parse(storage.globalGet("Contract9b4Qf7SKxSH1dbofDBtSPhCc9Joy9MdV5G4ECus6SeKs", "liquidityPairKeys"));

        if (lpkeys.includes(account)) {
            orderID = this._generateLPID(account);
        }
        else {
            orderID = this._generateOrderID();
        }

        let order = {
            orderID: orderID,
            account: account,
            symbol: tokenSymbol,
            amount: amount,
            initialAmount: amount,
            currentFullfilled: "0",
            price: price,
            isBuy: isBuy,
            fee: fee,
            orderStatus: "pending",
            createdTime: dateTime,
            updatedTime: "",
            referee: referee
        };

        storage.mapPut("orders", orderID, JSON.stringify(order));

        return order;
    }

    _generateOrderID() {
        let id = storage.get("orderID") * 1;
        let newID = id + 1;
        storage.put("orderID", newID.toString());
        return id.toString();
    }

    

    _isLPContract(user) {
        let lpkeys = JSON.parse(storage.globalGet("Contract9b4Qf7SKxSH1dbofDBtSPhCc9Joy9MdV5G4ECus6SeKs", "liquidityPairKeys"));
        if (lpkeys.includes(user)) {
            return true;
        }
        return false;

    }

    _checkTransfer(user, tokenSymbol, to, amount, memo) {
        if (this._isLPContract(user)) {
            this._transferLP(user, tokenSymbol, to, amount, memo);
        }
        else {
            this._transferToken(tokenSymbol, blockchain.contractName(), to, amount);
        }
    }

    _transferLP(lpcontract, tokenSymbol, to, amount, memo) {
        let amt = new Float64(amount * 1).toFixed(8);
        let tcontract;

        if (tokenSymbol === 'iost') {
            tcontract = 'token.iost'
        }
        else {
            tcontract = storage.mapGet("tokensContracts", tokenSymbol);
        }

        let args = [
            tcontract,
            tokenSymbol,
            to,
            amt,
            memo
        ];

        blockchain.callWithAuth(lpcontract, "transferFrom", JSON.stringify(args)); 

    }

    _transferToken(tokenSymbol, from, to, amount) {
        let amt = new Float64(amount * 1).toFixed(8);
        
        let args = [
            tokenSymbol,
            from,
            to,
            amt,
            amount + " " + tokenSymbol + " got transfered from " + from + " to " + to
        ];
        let contract;

        if (tokenSymbol === 'iost') {
            contract = 'token.iost'
        }
        else {
            contract = storage.mapGet("tokensContracts", tokenSymbol);
        }


        blockchain.callWithAuth(contract, "transfer", JSON.stringify(args));

    }


}

module.exports = Exchange;
