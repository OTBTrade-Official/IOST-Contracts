
const cadmin = "otb_admin";
const tradingFee = 0.002;
const discount = 0.25;


// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class Exchange {
    init() {

    }

    //Only owner can update.
    can_update(data) {
        return blockchain.requireAuth(blockchain.contractOwner(), "active");
    }

    updateInit() {
        this._assertAccountAuth(blockchain.contractOwner());
    }

    ////////////////////////////
    // Lottery MANAGEMENT     //
    ////////////////////////////

    //Draw Lottery:
    drawLottery(numWinners) {
        this._assertAccountAuth("otblottery");

        let counter = 0;
        let tickets = this._getLotteryTickets();
        let unique = tickets.filter(this._distinct);
        let winners = [];
        while (counter < numWinners && tickets.length > 0) {
            let bi = JSON.parse(blockchain.blockInfo());
            let bn = bi.number;
            let random = Math.floor(((bn % 10) / 10) * tickets.length);

            let winner = tickets[random];
            winners.push(winner);
            tickets = tickets.filter(acc => acc !== winner);
            counter++;
        }
        let lotteryBalance =
            blockchain.callWithAuth("token.iost", "balanceOf", [
                "iost",
                "otblottery"
            ]);

        let reward = (lotteryBalance / numWinners).toFixed(8);
        this._deleteLottery();

        winners.forEach(acc => {
            blockchain.callWithAuth("token.iost", "transfer", ["iost", tx.publisher, acc, reward, "otbLottery Reward"]);
        })


        return {
            winners: winners,
            date: block.time,
            reward: lotteryBalance / numWinners,
            unique: unique.length
        };
    }

    _addTicket(account) {
        let lotteryContainerCount = storage.get("lotteryID");
        let container;
        if (storage.mapHas("lotteryTickets", lotteryContainerCount)) {
            container = JSON.parse(
                storage.mapGet("lotteryTickets", lotteryContainerCount)
            );
        } else {
            container = [];
        }

        container.push(account);

        storage.mapPut(
            "lotteryTickets",
            lotteryContainerCount,
            JSON.stringify(container)
        );

        if (container.length > 1000) {
            lotteryContainerCount = (lotteryContainerCount * 1 + 1).toString();
            storage.put("lotteryID", lotteryContainerCount);
        }
    }

    _deleteLottery() {
        let counter = 0;
        let max = storage.get("lotteryID");
        while (counter <= max) {
            storage.mapDel("lotteryTickets", counter.toString());
            counter++;
        }
        storage.put("lotteryID", "0");
        storage.mapPut("lotteryTickets", "0", JSON.stringify([]));
    }

    //retrieves all lottery tickets.
    _getLotteryTickets() {
        let counter = 0;
        let max = storage.get("lotteryID");
        let tickets = [];
        while (counter <= max) {
            let t = JSON.parse(storage.mapGet("lotteryTickets", counter.toString()));
            tickets = tickets.concat(t);
            counter++;
        }

        return tickets.filter(a => a !== "otbbuyback" && a !== "otb_admin");
    }

    //Use with filter to find unique strings.  
    _distinct(v, i, s) {
        return s.indexOf(v) === i;
    }

    ////////////////////////////
    // TOKEN MANAGEMENT       //
    ////////////////////////////

    //Adds a token to the listed tokens on the exchange.
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

    delist(sym) {
        this._assertAccountAuth(cadmin);
        storage.mapDel("tokens", sym);
        storage.mapDel("tokensContracts", sym);
        let arr = JSON.parse(storage.get("tokensInfo"));
        arr = arr.filter(t => t.symbol !== sym);
        storage.put("tokensInfo", JSON.stringify(arr));
    }


    //Purchase Discount.  1 otbToken gives you a 25% discount for 10 trades.
    buyDiscount(otbTokens) {
        //makes sure that price and amount are valid numbers.
        if (otbTokens * 0 !== 0) {
            throw "Otbc amount must be a valid number and not a string. ";
        }

        //Users must trade more than the value of 10 Iost.
        if (otbTokens < 1) {
            throw "Total otbc value must be greater than or equivalent to 1. ";
        }

        if (otbTokens % 1 > 0) {
            throw "Total otbc value must be a whole number. ";
        }

        let num = otbTokens * 1;
        for (var i = 0; i < num.toFixed(0); i++) {
            this._addTicket(tx.publisher);
        }

        //sends otbc back to the otbc token contract.  
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

    //Checks to see if user has any discount vouchers.  If so then apply the discount.
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

    /////////////////////////////
    // GET ORDER BOOK DATA     //
    /////////////////////////////

    ///////////////////////////
    // Referral LOGIC //
    ///////////////////////////
    //Check to see if the referee is an exclusive referree member.
    //Checks to see if user has already been referred by another exclusive member.
    _checkReferral(referee, account) {
        let exclusiveReferrals = JSON.parse(storage.get("exclusiveReferrals"));

        //Check if user already has a referee
        //If so, use that referree insteand.  If not, then assign the referree if they belong to exclusive members.
        if (storage.mapHas("account", account)) {
            let referredBy = JSON.parse(storage.mapGet("account", account));
            if (referredBy.referredBy !== null) {
                referee = referredBy.referredBy;
            } else {
                if (referee !== "null") {
                    if (exclusiveReferrals.includes(referee)) {
                        referredBy.referredBy = referee;
                        storage.mapPut("account", account, JSON.stringify(referredBy));
                    }
                } else {
                    referee = referredBy.referredBy;
                }
            }
        } else {
            if (referee !== "null") {
                if (exclusiveReferrals.includes(referee)) {
                    let accountInfo = { lottery: 0, referredBy: referee };
                    storage.mapPut("account", account, JSON.stringify(accountInfo));
                } else {
                    let accountInfo = { lottery: 0, referredBy: null };
                    storage.mapPut("account", account, JSON.stringify(accountInfo));
                    return null;
                }
            }
        }

        if (referee === "null") {
            return null;
        }

        return referee;
    }


    ///////////////////////////
    // BUY LIMIT ORDER LOGIC //
    ///////////////////////////
    buyToken(tokenSymbol, price, amount, referee) {

        //Checks to see if token is listed.

        if (!storage.mapHas("tokens", tokenSymbol)) {
            throw "This token is not listed.";
        }

        //checks to make sure users don't trade iost/iost pair.
        if (tokenSymbol === "iost") {
            throw "iost/iost is not a valid trade pair. ";
        }

        //makes sure that price and amount are valid numbers.
        if (price * 0 !== 0 || amount * 0 !== 0) {
            throw "Price and amount must be a valid number and not a string. ";
        }

        //Users must trade more than the value of 10 Iost.
        if (price * amount < 10) {
            throw "Total iost trade value must be greater than 10. ";
        }

        //makes sure price and amount is not lower than zero.
        if (price * 1 <= 0 || amount * 1 <= 0) {
            throw "Price and amount must be greater than zero. ";
        }

        //creates a new user order array on the block if none exists.
        if (!storage.mapHas(tx.publisher, tokenSymbol)) {
            storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify([]));
        }

        let userOrders = JSON.parse(storage.mapGet(tx.publisher, tokenSymbol));

        //makes sure that user can only put in 50 orders max per token.
        if (userOrders.length === 50) {
            throw "You exceeded the max orders for this token.  ";
        }

        let tokenDecimal = storage.mapGet("tokens", tokenSymbol);

        let buyerFee = this._tradeFeesDiscount(tx.publisher) * 1;
        let totalAmountIostNecessary = amount * price;
        let fee = totalAmountIostNecessary * buyerFee;

        let fixedAmount = (amount * 1).toFixed(tokenDecimal).toString();
        let iostFixed = (price * 1).toFixed(8).toString();

        let referredBy = this._checkReferral(referee, tx.publisher);

        //create an order entry
        let order = this._createOrder(
            tx.publisher,
            tokenSymbol,
            fixedAmount,
            iostFixed,
            true,
            buyerFee.toFixed(8).toString(),
            referredBy
        );

        //Statement returns true, therefore we will create a buy limit order.
        this._transferToken(
            "iost",
            tx.publisher,
            blockchain.contractName(),
            (totalAmountIostNecessary + fee).toString()
        );


        userOrders.push(order.orderID);
        storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify(userOrders));

        storage.mapPut("orders", order.orderID, JSON.stringify(order));
        return order.orderID;
    }

    ////////////////////////////
    // SELL LIMIT ORDER LOGIC //
    ////////////////////////////
    sellToken(tokenSymbol, price, amount, referee) {

        //Checks to see if token is listed.
        if (!storage.mapHas("tokens", tokenSymbol)) {
            throw "This token is not listed.";
        }

        //checks to make sure users don't trade iost/iost pair.
        if (tokenSymbol === "iost") {
            throw "iost/iost is not a valid trade pair. ";
        }

        //makes sure that price and amount are valid numbers.
        if (price * 0 !== 0 || amount * 0 !== 0) {
            throw "Price and amount must be a valid number and not a string. ";
        }

        //Users must trade more than the value of 10 Iost.
        if (price * amount < 10) {
            throw "Total iost trade value must be greater than 10. ";
        }

        //makes sure price and amount is not lower than zero.
        if (price * 1 <= 0 || amount * 1 <= 0) {
            throw "Price and amount must be greater than zero. ";
        }

        //creates a new user order array on the block if none exists.
        if (!storage.mapHas(tx.publisher, tokenSymbol)) {
            storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify([]));
        }

        let userOrders = JSON.parse(storage.mapGet(tx.publisher, tokenSymbol));

        //makes sure that user can only put in 50 orders max per token.
        if (userOrders.length === 50) {
            throw "You exceeded the max orders for this token.  ";
        }

        let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

        let sellerFee = this._tradeFeesDiscount(tx.publisher) * 1;

        this._transferToken(
            tokenSymbol,
            tx.publisher,
            blockchain.contractName(),
            (amount * 1).toFixed(tokenDecimal).toString()
        );

        let referredBy = this._checkReferral(referee, tx.publisher);

        //create an order entry
        let order = this._createOrder(
            tx.publisher,
            tokenSymbol,
            (amount * 1).toFixed(tokenDecimal).toString(),
            (price * 1).toFixed(8).toString(),
            false,
            sellerFee.toString(),
            referredBy
        );

        userOrders.push(order.orderID);
        storage.mapPut(tx.publisher, tokenSymbol, JSON.stringify(userOrders));

        storage.mapPut("orders", order.orderID, JSON.stringify(order));
        return order.orderID;
    }

    //////////////////////////////
    // CANCEL LIMIT ORDER LOGIC //
    //////////////////////////////
    cancelOrder(orderID) {
        let order = JSON.parse(storage.mapGet("orders", orderID));

        if (order.orderStatus == "cancelled" || order.orderStatus == "completed") {
            throw "This orders is already cancelled or completed. ";
        }

        //checks to make sure that the user cancelling the order is indeed the same person who requested the order.
        if (order.account !== tx.publisher) {
            throw "You are not authorized to cancel this order. ";
        }

        let totalIostRefund = order.amount * order.price * (1 + order.fee * 1);

        //Checks to see if it is a sell order.  If true, then cancel the sell order.  Else cancel the buy order.
        if (order.isBuy == false) {

            if ((order.amount * 1).toFixed(8) > 0) {
                //Smart contract refunds the user the remainder of tokens in the order.
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

        //cancels the buy order.
        else {
            //Blockchain refunds the user the amount with fees reimbursed.
            if (totalIostRefund.toFixed(8) > 0) {
                this._transferToken(
                    "iost",
                    blockchain.contractName(),
                    order.account,
                    totalIostRefund.toFixed(8).toString()
                );
            }

        }

        if (order.amount * 1 < order.initialAmount * 1) {
            this._addTicket(order.account);
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

        //Generate blockchain receipt.
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

    // ----------------------------------------------------------------------------------------------------------

    _initKeysForOrderBooks(tokenSymbol) {
        storage.mapPut("buyOrders", tokenSymbol + ":priceKeys", JSON.stringify([]));
        storage.mapPut(
            "sellOrders",
            tokenSymbol + ":priceKeys",
            JSON.stringify([])
        );
    }

    //Handles the split of fees on the contract. 
    _handleFees(fees) {
        let lotteryPool = storage.get("lotteryPool") * 1;
        let otbTeam = storage.get("otbTeam") * 1;

        lotteryPool += fees / 2;
        otbTeam += fees / 2;

        storage.put("lotteryPool", lotteryPool.toFixed(8));
        storage.put("otbTeam", otbTeam.toFixed(8));
    }

    handleTrade(orderID) {
        //Check that admin is handler.
        this._assertAccountAuth(cadmin);

        //validates that order exists.
        if (!storage.mapHas("orders", orderID)) {
            throw "Order does not exist. ";
        }

        let order = JSON.parse(storage.mapGet("orders", orderID));

        //Checks if order has already been handled.
        if (order.orderStatus !== "pending") {
            throw "Order has already been handled. ";
        }
        order.orderStatus = "opened";

        let tokenSymbol = order.symbol;
        let price = order.price * 1;
        let fee = order.fee * 1;
        let referee = order.referee;

        //check if this is a buy or sell order
        if (order.isBuy) {
            //this is a buy order.
            let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

            //check if there are sell orders that can fullfill buy order
            if (this._checkNewBuyGTESellLowest(tokenSymbol, price)) {
                //Check sell order book from lowest to highest.
                let sellPrices = JSON.parse(
                    storage.mapGet("sellOrders", tokenSymbol + ":priceKeys")
                );
                let counter = 0;
                let orderAmount = order.amount * 1;
                let leftOver = order.amount * order.price * (1 + fee);
                let sellOrders = [];



                //Get all sell orders that can be fulfilled.
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
                            sellPrices[counter].toFixed(8).toString()
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
                        //Complete the seller's order.

                        //seller receives lottery ticket
                        this._addTicket(sOrder.account);

                        let yourFee = (sOrderIOST * fee).toFixed(8);
                        let sellFee = (sOrderIOST * sOrder.fee).toFixed(8);

                        //Seller receives iost from BC
                        this._transferToken(
                            "iost",
                            blockchain.contractName(),
                            sOrder.account,
                            (sOrderIOST - sellFee * 1).toFixed(8)
                        );

                        //decrement leftover based on totaliost in the order. Partial fullfilled plus fees.  
                        leftOver -= (sOrderIOST * 1 + yourFee * 1);

                        //increment volume
                        vol += sOrder.amount * 1;

                        //You receive tokens from blockchain.
                        this._transferToken(
                            tokenSymbol,
                            blockchain.contractName(),
                            order.account,
                            (sOrder.amount * 1).toFixed(tokenDecimal)
                        );

                        this._feeHandler(referee, sellReferee, yourFee, sellFee);

                        //decrement your current amount.
                        amountNecessary -= sOrder.amount * 1;

                        //update and delete seller's order
                        sOrder.currentFullfilled = (
                            sOrder.currentFullfilled * 1 +
                            sOrder.amount * 1
                        ).toString();
                        sOrder.updatedTime = block.time;
                        sOrder.orderStatus = "completed";

                        this._delOrder(sOrder, tokenSymbol);
                        sOrder.amount = "0";

                        //blockchain receipt
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
                        //You have less than the seller's amount. complete your order.  Update seller's order.


                        let yourFee = (amountNecessary * sOrder.price * fee).toFixed(8);
                        let sellFee = (amountNecessary * sOrder.price * sOrder.fee).toFixed(8);

                        //You receive tokens from BC
                        this._transferToken(
                            tokenSymbol,
                            blockchain.contractName(),
                            order.account,
                            amountNecessary.toFixed(tokenDecimal).toString()
                        );

                        //Seller receives iost from BC
                        this._transferToken(
                            "iost",
                            blockchain.contractName(),
                            sOrder.account,
                            (amountNecessary * sOrder.price - sellFee * 1).toFixed(8)
                        );

                        //decrement leftover based on totaliost in the order.
                        leftOver -= (amountNecessary * sOrder.price + yourFee * 1);
                        this._feeHandler(referee, sellReferee, yourFee, sellFee);



                        //increment volume
                        vol += amountNecessary;

                        //update seller's order
                        sOrder.currentFullfilled = (
                            sOrder.currentFullfilled * 1 +
                            amountNecessary
                        ).toString();
                        sOrder.amount = (sOrder.amount * 1 - amountNecessary).toString();
                        sOrder.updatedTime = block.time;

                        this._updateOrder(tokenSymbol, sOrder, amountNecessary);

                        amountNecessary = 0;



                        //blockchain receipt
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

                if (leftOver - (amountNecessary * price * (1 + fee)) > 0) {
                    //You receive leftover iost from BC
                    this._transferToken(
                        "iost",
                        blockchain.contractName(),
                        order.account,
                        (leftOver - (amountNecessary * price * (1 + fee))).toFixed(8)
                    );
                }



                //update the amounts in your order.
                order.currentFullfilled = (
                    order.initialAmount * 1 -
                    amountNecessary
                ).toString();
                order.amount = amountNecessary.toString();
                order.updatedTime = block.time;

                //Your amount has been fulfilled.  Complete and delete your order.
                if (order.amount === "0") {
                    order.orderStatus = "completed";
                    //You get a ticket
                    this._addTicket(order.account);

                    this._delOrder(order, tokenSymbol);
                } else {
                    this._updateOrder(tokenSymbol, order, amountNecessary * -1);
                }
            } else {
                //There are no sell orders to fullfill the order so add the order to orderbook.
                this._checkNewBuyExists(tokenSymbol, order);
            }
        } else {
            //this is a sell order.
            let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

            //check if there are buy orders that can fullfill order
            if (this._checkNewSellLTEBuyHighest(tokenSymbol, price)) {
                //Check buy order book from highest to lowest.

                let buyPrices = JSON.parse(
                    storage.mapGet("buyOrders", tokenSymbol + ":priceKeys")
                );
                let counter = 0;
                let orderAmount = order.amount * 1;
                let buyOrders = [];

                //Get all buy orders that can be fulfilled.
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
                        //Complete the buyers's order.

                        //buyer receives a lottery ticket.  
                        this._addTicket(bOrder.account);

                        let buyFee = (bOrderIOST * bOrder.fee).toFixed(8);
                        let yourFee = (bOrderIOST * fee).toFixed(8);

                        //You receive iost from BC
                        this._transferToken(
                            "iost",
                            blockchain.contractName(),
                            order.account,
                            (bOrderIOST - yourFee * 1).toFixed(8)
                        );

                        //buyer receives tokens from blockchain.
                        this._transferToken(
                            tokenSymbol,
                            blockchain.contractName(),
                            bOrder.account,
                            (bOrder.amount * 1).toFixed(tokenDecimal)
                        );

                        this._feeHandler(referee, buyReferee, yourFee, buyFee);

                        //decrement your current amount.
                        amountNecessary -= bOrder.amount * 1;

                        //increment volume
                        vol += bOrder.amount * 1;

                        //update and delete buyer's order
                        bOrder.currentFullfilled = (
                            bOrder.currentFullfilled * 1 +
                            bOrder.amount * 1
                        ).toString();
                        bOrder.updatedTime = block.time;
                        bOrder.orderStatus = "completed";

                        this._delOrder(bOrder, tokenSymbol);
                        bOrder.amount = "0";

                        //blockchain receipt
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
                        //You have less than the buyer's amount. complete your order.  Update buyer's order.

                        let buyFee = (amountNecessary * bOrder.price * bOrder.fee).toFixed(8);
                        let yourFee = (amountNecessary * bOrder.price * fee).toFixed(8);

                        //Buyer receive tokens from BC
                        this._transferToken(
                            tokenSymbol,
                            blockchain.contractName(),
                            bOrder.account,
                            amountNecessary.toFixed(8)
                        );

                        //You receive iost from BC
                        this._transferToken(
                            "iost",
                            blockchain.contractName(),
                            order.account,
                            (amountNecessary * bOrder.price - yourFee * 1).toFixed(8)
                        );

                        this._feeHandler(referee, buyReferee, yourFee, buyFee);

                        //increment volume
                        vol += amountNecessary;

                        //update buyer's order
                        bOrder.currentFullfilled = (
                            bOrder.currentFullfilled * 1 +
                            amountNecessary
                        ).toString();
                        bOrder.amount = (bOrder.amount * 1 - amountNecessary * 1).toString();
                        bOrder.updatedTime = block.time;

                        this._updateOrder(tokenSymbol, bOrder, amountNecessary);
                        amountNecessary = 0;


                        //blockchain receipt
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

                //update the amounts in your order.
                order.currentFullfilled = (
                    order.initialAmount * 1 -
                    amountNecessary
                ).toString();
                order.amount = amountNecessary.toString();
                order.updatedTime = block.time;

                //Your amount has been fulfilled.  Complete and delete your order.
                if (order.amount === "0") {
                    order.orderStatus = "completed";
                    //you get a ticket
                    this._addTicket(order.account);
                    this._delOrder(order, tokenSymbol);
                } else {
                    this._updateOrder(tokenSymbol, order, amountNecessary * -1);
                }
            } else {
                //There are no sell orders to fullfill the order so add the order to orderbook.
                this._checkNewSellExists(tokenSymbol, order);
            }
        }

        let order_type;
        if (order.isBuy == true) {
            order_type = "buy";
        } else {
            order_type = "sell";
        }

        //Blockchain receipt for your user data.
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

    //Handle Reference and Fee distribution. 
    _feeHandler(yourRef, otherRef, yourFee, otherFee) {

        if (yourFee > 0) {

            //check referee for you and send 25% of fees to referee
            if (yourRef !== null && yourRef !== "null") {
                this._transferToken(
                    "iost",
                    blockchain.contractName(),
                    yourRef,
                    (yourFee * 0.25).toFixed(8)
                );

                yourFee = (yourFee * 0.75).toFixed(8);
            }


        }


        if (otherFee > 0) {

            //check referee for seller and send 25% fees to referee
            if (otherRef !== null && otherRef !== "null") {
                this._transferToken(
                    "iost",
                    blockchain.contractName(),
                    otherRef,
                    (otherFee * 0.25).toFixed(8)
                );
                otherFee = (otherFee * 0.75).toFixed(8);
            }
        }


        if (otherFee / 2 + yourFee / 2 > 0) {
            //Sends half of remaining fees from seller to otbtrade.
            this._transferToken(
                "iost",
                blockchain.contractName(),
                "otb_dev",
                (otherFee / 2 + yourFee / 2).toFixed(8)
            );

            //Sends half of remaining fees from seller to lottery.
            this._transferToken(
                "iost",
                blockchain.contractName(),
                "otblottery",
                (otherFee / 2 + yourFee / 2).toFixed(8)
            );
        }

    }

    //Checks first to see if there are any sell orders at all.
    //Checks if the new buy order is greater than or equal to the current lowest sell price.
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

    //Checks first to see if there are any buy orders at all.
    //Checks if the new sell order is less than or equal to the current highest buy price.
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

    //Check if there are any buy prices at all.
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

    //Check if there are any sell prices at all.
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

    //deletes order from everywhere.
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

    //updates order at user and order book.
    _updateOrder(tokenSymbol, order, amountNecessary) {
        //Update the order in the open orders book.
        let tokenDecimal = storage.mapGet('tokens', tokenSymbol) * 1;
        order.amount = (order.amount * 1).toFixed(tokenDecimal);
        storage.mapPut("orders", order.orderID, JSON.stringify(order));

        let orderType;

        //check to see if this is a buy or sell order.
        if (order.isBuy) {
            orderType = "buyOrders";
        } else {
            orderType = "sellOrders";
        }

        //Check to see if this is a pricekey that exists.
        if (
            storage.mapHas(
                orderType,
                tokenSymbol + ":" + (order.price * 1).toFixed(8)
            )
        ) {
            //If yes, then just update the current amount and order books in the price key.
            let priceOrder = JSON.parse(
                storage.mapGet(
                    orderType,
                    tokenSymbol + ":" + (order.price * 1).toFixed(8)
                )
            );

            //filters out the orderID first then re-add.
            priceOrder.orders = priceOrder.orders.filter(or => or !== order.orderID);

            //if the orderbook does not include this order id, it means it's a new order so add it to the stack.
            priceOrder.orders.push(order.orderID);

            //Sorts the orders.
            priceOrder.orders = priceOrder.orders.sort(function (a, b) {
                return a.orderID - b.orderID;
            });

            //subtract the amount that needs to be updated.
            priceOrder.amount = (priceOrder.amount * 1).toFixed(tokenDecimal) - (amountNecessary * 1).toFixed(tokenDecimal);

            //Store the pricekey Orderbook back in the chain.
            storage.mapPut(
                orderType,
                tokenSymbol + ":" + (order.price * 1).toFixed(8),
                JSON.stringify(priceOrder)
            );
        } else {
            //Order price is not a price key that exists.
            //Create the price key and create the orderbook for that price.
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

    //Check to make sure that the account is authorized to perform a function.
    _assertAccountAuth(account) {
        if (!blockchain.requireAuth(account, "active")) {
            throw "Authorization Failure";
        }
    }


    //creates a new order
    _createOrder(account, tokenSymbol, amount, price, isBuy, fee, referee) {
        let orderID = this._generateOrderID();
        let dateTime = block.time;
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

    //returns an order id generated by the contract.
    _generateOrderID() {
        let id = storage.get("orderID") * 1;
        let newID = id + 1;
        storage.put("orderID", newID.toString());
        return id.toString();
    }


    //transfers tokens/iost
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

    updateErrors() {
        this._assertAccountAuth(cadmin);
        storage.mapPut("tokensContracts", "playgold", "token.iost");

    }

}

module.exports = Exchange;
