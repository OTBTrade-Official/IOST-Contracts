//This is the exchange smart contract.

const iostDecimal = 8;
const cadmin = "otb_admin";
const lottAdmin = "otblottery";
const tradingFee = 0.002;
const discount = 0.25;

class Lottery {
  constructor(lotteryID, user) {
    this.lotteryID = lotteryID;
    this.user = user;
    this.date = block.time;
  }
}

// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class Exchange {
  init() {
    //stores orders in an orderbook.

    storage.put("orderID", "0");
    storage.put("orderIDStart", "0");
    storage.put("lotteryID", "0");
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
    this._assertAccountAuth(cadmin);

    let counter = 0;
    let tickets = this._getLotteryTickets();
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
      ]) / 2;

    blockchain.receipt(
      JSON.stringify({
        winners: winners,
        date: block.time,
        reward: lotteryBalance / numWinners
      })
    );

    return winners;
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

    if (container.length > 100) {
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
      t.forEach(ticket => {
        tickets.push(ticket);
      });
      counter++;
    }

    return tickets;
  }

  ////////////////////////////
  // TOKEN MANAGEMENT       //
  ////////////////////////////

  //Adds a token to the listed tokens on the exchange.
  listToken(tokenSymbol, decimal) {
    this._assertAccountAuth(cadmin);

    if (storage.mapHas("tokens", tokenSymbol)) {
      throw "Token is already listed.";
    }

    storage.mapPut("tokens", tokenSymbol, decimal);
  }

  //delists a token from the smart contract
  delistToken(tokenSymbol) {
    this._assertAccountAuth(cadmin);
    if (!storage.mapHas("tokens", tokenSymbol)) {
      throw "This token is not listed.";
    }
    storage.mapDel("tokens", tokenSymbol);
  }

  //updates the token decimal.
  updateTokenDecimal(tokenSymbol, decimal) {
    this._assertAccountAuth(cadmin);
    if (!storage.mapHas("tokens", tokenSymbol)) {
      throw "This token is not listed.";
    }
    storage.mapPut("tokens", tokenSymbol, decimal);
  }

  //Purchase Discount.  1 otbToken gives you a 25% discount for 10 trades.
  buyDiscount(otbTokens) {
    let accountBal = blockchain.callWithAuth("token.iost", "balanceOf", [
      "otbc",
      tx.publisher
    ]);

    //check to make sure there are tokens to consume.
    if (accountBal <= 0 || otbTokens > accountBal) {
      throw "Unable to purchase discount.  Not enough otbt. ";
    }

    let args = [
      "otbc",
      tx.publisher,
      blockchain.contractName(),
      otbTokens,
      "User bought discount vouchers from otbTrade. "
    ];

    blockchain.callWithAuth("token.iost", "transfer", JSON.stringify(args));

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

  _checkOrderStart() {
    let start = storage.get("orderIDStart") * 1;
    let end = storage.get("orderID") * 1;

    while (start < end) {
      if (storage.mapHas("orders", start.toString())) {
        storage.put("orderIDStart", start.toString());
        return start;
      }
      start++;
    }

    return end - 1;
  }
  //Get open sell orders for a token.
  _getOpenSellOrders(tokenSymbol) {
    if (!storage.mapHas("tokens", tokenSymbol)) {
      throw "This token is not listed.";
    }

    let orders_length = this._checkOrderStart();
    let sellOrders = [];

    //filters the sell orders that are pending in an order book.
    while (orders_length < storage.get("orderID") * 1) {
      if (storage.mapHas("orders", orders_length.toString())) {
        let order = JSON.parse(
          storage.mapGet("orders", orders_length.toString())
        );
        if (
          order.isBuy == false &&
          order.orderStatus == "opened" &&
          order.symbol == tokenSymbol
        ) {
          sellOrders.push(order);
        }
      }
      orders_length++;
    }

    //Returns the sorted arry of open sell orders.
    sellOrders = this._orderSellSorter(sellOrders);

    return sellOrders;
  }

  //Get open buy orders for a token.
  _getOpenBuyOrders(tokenSymbol) {
    if (!storage.mapHas("tokens", tokenSymbol)) {
      throw "This token is not listed.";
    }
    let orders_length = this._checkOrderStart();
    let buyOrders = [];

    //filters the sell orders that are pending in an order book.  Lowest price to highest.  Oldest date to newest.
    while (orders_length < storage.get("orderID") * 1) {
      if (storage.mapHas("orders", orders_length.toString())) {
        let order = JSON.parse(
          storage.mapGet("orders", orders_length.toString())
        );
        if (
          order.isBuy == true &&
          order.orderStatus == "opened" &&
          order.symbol == tokenSymbol
        ) {
          buyOrders.push(order);
        }
      }
      orders_length++;
    }

    //Returns the sorted arry of open buy orders. Highest price to lowest.  Oldest date to newest.
    buyOrders = this._orderBuySorter(buyOrders);

    return buyOrders;
  }

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

  addExclusiveMembers(member) {
    this._assertAccountAuth(cadmin);
    let members = JSON.parse(storage.get("exclusiveReferrals"));

    if (!members.includes(member)) {
      members.push(member);
      storage.put("exclusiveReferrals", JSON.stringify(members));
    }
  }

  ///////////////////////////
  // BUY LIMIT ORDER LOGIC //
  ///////////////////////////
  buyToken(tokenSymbol, price, amount, referee) {
    this._assertAccountAuth(cadmin);

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

    let tokenDecimal = storage.mapGet("tokens", tokenSymbol);

    let buyerFee = this._tradeFeesDiscount(tx.publisher) * 1;
    let totalAmountIostNecessary = amount * price;
    let totalIostWithFees = totalAmountIostNecessary * (1 + buyerFee);

    let userBalance = blockchain.callWithAuth("token.iost", "balanceOf", [
      "iost",
      tx.publisher
    ]);

    //check to make sure user balance is greater than the total expense.
    if (
      userBalance < totalIostWithFees ||
      userBalance - totalIostWithFees < 0
    ) {
      throw "Insufficient balance";
    }

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
    let transferedIost = totalIostWithFees.toFixed(iostDecimal);
    this._transferToken(
      "iost",
      tx.publisher,
      blockchain.contractName(),
      transferedIost.toString()
    );

    storage.mapPut("orders", order.orderID, JSON.stringify(order));
    return order.orderID;
  }

  handleTrade(orderID) {
    this._assertAccountAuth(cadmin);

    let order = JSON.parse(storage.mapGet("orders", orderID));

    if (order.orderStatus != "pending") {
      throw "This orders is either cancelled or processed. ";
    }

    //This is a buy order
    if (order.isBuy == true) {
      let tokenSymbol = order.symbol;
      order.orderStatus = "opened";
      storage.mapPut("orders", order.orderID, JSON.stringify(order));

      let sell_orders = this._getOpenSellOrders(tokenSymbol);
      let amount = order.amount * 1;
      let amountNecessary = amount;
      let price = order.price;
      let fee = order.fee * 1;
      let counter = 0;
      let leftOver = order.amount * order.price * (1 + fee);
      let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;
      let referee = order.referee;
      let volume = 0;

      if (sell_orders.length && sell_orders[0].price * 1 <= order.price * 1) {
        //market order: current sell price is smaller or equal to buy price!

        //1st: find the "cheapest sell price" that is lower than the buy amount  [buy: 60@5000] [sell: 50@4500] [sell: 5@5000]
        //2: buy up the volume for 4500
        //3: buy up the volume for 5000
        //if still something remaining -> buyToken

        //2: buy up the volume
        //2.1 add ether to seller, add symbolName to buyer until offers_key <= offers_length
        while (
          sell_orders[counter] != undefined &&
          sell_orders[counter].price * 1 <= price &&
          amountNecessary > 0
        ) {
          //Two choices from here:
          //1) one person offers not enough volume to fulfill the market order - we use it up completely and move on to the next person who offers the symbolName
          //2) else: we make use of parts of what a person is offering - lower his amount, fulfill out order.
          if (sell_orders[counter].amount * 1 <= amountNecessary) {
            let sellerTotalIost =
              sell_orders[counter].amount * sell_orders[counter].price;
            let sellerMinusFees =
              sellerTotalIost * (1 - sell_orders[counter].fee * 1);

            let sellerRef = sell_orders[counter].referee;

            //Transfer fees from buyer and seller to lottery account and referees
            let buyFee =
              sell_orders[counter].amount * sell_orders[counter].price * fee;
            let sellFee =
              sell_orders[counter].amount *
              sell_orders[counter].price *
              sell_orders[counter].fee;

            if (referee !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                referee,
                (buyFee * 0.25).toFixed(iostDecimal).toString()
              );

              buyFee = buyFee * 0.75;
            }

            if (sellerRef !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                sellerRef,
                (sellFee * 0.25).toFixed(iostDecimal).toString()
              );

              sellFee = sellFee * 0.75;
            }

            let total_fee = (buyFee + sellFee).toFixed(iostDecimal);

            this._transferToken(
              "iost",
              blockchain.contractName(),
              lottAdmin,
              total_fee.toString()
            );

            //this guy offers less or equal the volume that we ask for, so we use it up completely.
            //Transfers tokens to the buyer's account.

            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              tx.publisher,
              (sell_orders[counter].amount * 1).toFixed(tokenDecimal).toString()
            );

            volume += (sell_orders[counter].amount * 1).toFixed(tokenDecimal);

            //Transfers iost to the seller's account.
            this._transferToken(
              "iost",
              blockchain.contractName(),
              sell_orders[counter].account,
              sellerMinusFees.toFixed(8).toString()
            );

            leftOver -=
              sell_orders[counter].amount *
              sell_orders[counter].price *
              (1 + 1 * fee);

            //seller receives payment less the trade fees.
            sell_orders[counter].currentFullfilled = (
              sell_orders[counter].currentFullfilled * 1 +
              1 * sell_orders[counter].amount
            ).toFixed(tokenDecimal);
            amountNecessary -= sell_orders[counter].amount * 1;
            order.amount = amountNecessary.toString();
            order.currentFullfilled = (
              order.currentFullfilled * 1 +
              1 * sell_orders[counter].amount
            ).toFixed(tokenDecimal);
            order.updatedTime = block.time;

            sell_orders[counter].amount = "0";
            sell_orders[counter].orderStatus = "completed";
            sell_orders[counter].updatedTime = block.time;

            //Seller receives a ticket for the completed order.
            this._addTicket(sell_orders[counter].account);

            storage.mapDel("orders", sell_orders[counter].orderID);
            blockchain.receipt(
              JSON.stringify({
                txType: "price-action",
                orderType: "buy",
                orderID: sell_orders[counter].orderID,
                symbol: sell_orders[counter].symbol,
                user: sell_orders[counter].account,
                price: sell_orders[counter].price,
                amount: sell_orders[counter].initialAmount,
                time: block.time,
                volume: volume,
                status: sell_orders[counter].orderStatus,
                order: sell_orders[counter]
              })
            );

            blockchain.receipt(
              JSON.stringify({
                txType: "user-record",
                orderType: "sell",
                orderID: sell_orders[counter].orderID,
                symbol: sell_orders[counter].symbol,
                user: sell_orders[counter].account,
                price: sell_orders[counter].price,
                amount: sell_orders[counter].currentFullfilled,
                time: block.time,
                volume: volume,
                status: sell_orders[counter].orderStatus,
                order: sell_orders[counter]
              })
            );
          } else {
            let totalAmountIostNecessary =
              amountNecessary * sell_orders[counter].price;
            let totalIostMinusFees =
              totalAmountIostNecessary * (1 - sell_orders[counter].fee * 1);

            //this guy offers more than we ask for. We reduce his stack, add the tokens to us and the iost to him.
            sell_orders[counter].amount = (
              sell_orders[counter].amount * 1 -
              amountNecessary * 1
            )
              .toFixed(tokenDecimal)
              .toString();
            sell_orders[counter].currentFullfilled = (
              sell_orders[counter].currentFullfilled * 1 +
              1 * amountNecessary
            )
              .toFixed(tokenDecimal)
              .toString();
            sell_orders[counter].updatedTime = block.time;

            storage.mapPut(
              "orders",
              sell_orders[counter].orderID,
              JSON.stringify(sell_orders[counter])
            );

            //Transfer iost to the seller.
            this._transferToken(
              "iost",
              blockchain.contractName(),
              sell_orders[counter].account,
              totalIostMinusFees.toFixed(8).toString()
            );

            //Transfer Seller fees and buyer fees to lottery account
            let buyFee = amountNecessary * sell_orders[counter].price * fee;
            let sellFee =
              amountNecessary *
              sell_orders[counter].price *
              sell_orders[counter].fee;
            let sellerRef = sell_orders[counter].referee;

            if (referee !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                referee,
                (buyFee * 0.25).toFixed(iostDecimal).toString()
              );

              buyFee = buyFee * 0.75;
            }

            if (sellerRef !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                sellerRef,
                (sellFee * 0.25).toFixed(iostDecimal).toString()
              );

              sellFee = sellFee * 0.75;
            }

            let total_fee = buyFee + sellFee;

            this._transferToken(
              "iost",
              blockchain.contractName(),
              lottAdmin,
              total_fee.toFixed(8).toString()
            );

            leftOver =
              leftOver -
              amountNecessary * sell_orders[counter].price * (1 + 1 * fee);

            //Receive tokens from the contract
            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              tx.publisher,
              amountNecessary.toFixed(tokenDecimal).toString()
            );

            volume += amountNecessary.toFixed(tokenDecimal);

            order.currentFullfilled = (
              order.currentFullfilled * 1 +
              amountNecessary
            )
              .toFixed(tokenDecimal)
              .toString();
            order.orderStatus = "completed";
            order.amount = "0";
            order.updatedTime = block.time;
            amountNecessary = 0;

            blockchain.receipt(
              JSON.stringify({
                txType: "price-action",
                orderType: "buy",
                orderID: sell_orders[counter].orderID,
                symbol: sell_orders[counter].symbol,
                user: sell_orders[counter].account,
                price: sell_orders[counter].price,
                amount: order.initialAmount,
                time: block.time,
                volume: volume,
                status: sell_orders[counter].orderStatus,
                order: sell_orders[counter]
              })
            );

            blockchain.receipt(
              JSON.stringify({
                txType: "user-record",
                orderType: "sell",
                orderID: sell_orders[counter].orderID,
                symbol: sell_orders[counter].symbol,
                user: sell_orders[counter].account,
                price: sell_orders[counter].price,
                amount: sell_orders[counter].currentFullfilled,
                time: block.time,
                volume: volume,
                status: sell_orders[counter].orderStatus,
                order: sell_orders[counter]
              })
            );
            //we have fulfilled our order
          }

          if (amountNecessary > 0) {
            counter++;
          }
        }

        if (amountNecessary > 0) {
          storage.mapPut("orders", order.orderID, JSON.stringify(order));
        } else {
          storage.mapDel("orders", order.orderID);
          order.orderStatus = "completed";
          order.amount = "0";

          //add a ticket to our order
          this._addTicket(order.account);
        }

        leftOver -= order.amount * order.price * (1 + order.fee * 1);

        if (leftOver > 0) {
          this._transferToken(
            "iost",
            blockchain.contractName(),
            tx.publisher,
            leftOver.toFixed(8).toString()
          );
        }
      }
    }
    //This is a sell order
    else {
      let tokenSymbol = order.symbol;
      order.orderStatus = "opened";
      storage.mapPut("orders", order.orderID, JSON.stringify(order));

      let buy_orders = this._getOpenBuyOrders(tokenSymbol);
      let amount = order.amount;
      let amountNecessary = amount * 1;
      let price = order.price * 1;
      let counter = 0;
      let buyerTokenBal;
      let sellerFee = order.fee * 1;
      let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;
      let referee = order.referee;
      let volume = 0;

      let userIOSTBalance = blockchain.callWithAuth("token.iost", "balanceOf", [
        "iost",
        tx.publisher
      ]);

      if (buy_orders.length && buy_orders[0].price * 1 >= price) {
        //market order: current buy price is bigger or equal to sell price!

        //1st: find the "highest buy price" that is higher than the sell amount  [buy: 60@5000] [buy: 50@4500] [sell: 500@4000]
        //2: sell up the volume for 5000
        //3: sell up the volume for 4500
        //if still something remaining -> sellToken limit order

        //2: sell up the volume
        //2.1 add ether to seller, add symbolName to buyer until offers_key <= offers_length

        while (
          buy_orders[counter] != undefined &&
          buy_orders[counter].price * 1 >= price &&
          amountNecessary > 0
        ) {
          //Two choices from here:
          //1) one person offers not enough volume to fulfill the market order - we use it up completely and move on to the next person who offers the symbolName
          //2) else: we make use of parts of what a person is offering - lower his amount, fulfill out order.

          if (buy_orders[counter].amount <= amountNecessary) {
            let totalAmountIostAvailable =
              buy_orders[counter].amount * buy_orders[counter].price;

            buyerTokenBal = blockchain.callWithAuth("token.iost", "balanceOf", [
              tokenSymbol,
              buy_orders[counter].account
            ]);

            //this guy offers less or equal the volume that we ask for, so we use it up completely
            //Transfer token to the buyer's account.
            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              buy_orders[counter].account,
              (buy_orders[counter].amount * 1).toFixed(tokenDecimal).toString()
            );

            volume += (buy_orders[counter].amount * 1).toFixed(tokenDecimal);

            let volumeAtPriceFromAddress = buy_orders[counter].amount * 1;
            buy_orders[counter].amount = "0";
            buy_orders[
              counter
            ].currentFullfilled = volumeAtPriceFromAddress
              .toFixed(tokenDecimal)
              .toString();
            buy_orders[counter].orderStatus = "completed";

            //adds a ticket to buyer
            this._addTicket(buy_orders[counter].account);

            //deletes the fulfilled buy order
            this._deleteOrder(buy_orders[counter].orderID);

            //You receive Iost from contract
            let totalIostMinusFees = totalAmountIostAvailable * (1 - sellerFee);
            this._transferToken(
              "iost",
              blockchain.contractName(),
              tx.publisher,
              totalIostMinusFees.toFixed(8).toString()
            );

            //Transfer fees from the buyer and seller to lottery account
            let buyFee = totalAmountIostAvailable * buy_orders[counter].fee;
            let sellFee = totalAmountIostAvailable - totalIostMinusFees;

            let buyerRef = buy_orders[counter].referee;

            if (referee !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                referee,
                (sellFee * 0.25).toFixed(iostDecimal).toString()
              );

              sellFee = sellFee * 0.75;
            }

            if (buyerRef !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                buyerRef,
                (buyFee * 0.25).toFixed(iostDecimal).toString()
              );

              buyFee = buyFee * 0.75;
            }

            let total_fee = (buyFee + sellFee).toFixed(iostDecimal);

            this._transferToken(
              "iost",
              blockchain.contractName(),
              lottAdmin,
              total_fee.toString()
            );

            amountNecessary -= volumeAtPriceFromAddress;
            order.currentFullfilled = (
              order.currentFullfilled * 1 +
              volumeAtPriceFromAddress
            )
              .toFixed(tokenDecimal)
              .toString();
            order.updatedTime = block.time;
            order.amount = amountNecessary.toFixed(tokenDecimal).toString();

            blockchain.receipt(
              JSON.stringify({
                txType: "price-action",
                orderType: "sell",
                orderID: buy_orders[counter].orderID,
                symbol: buy_orders[counter].symbol,
                user: buy_orders[counter].account,
                price: buy_orders[counter].price,
                amount: buy_orders[counter].initialAmount,
                time: block.time,
                volume: volume,
                status: buy_orders[counter].orderStatus,
                order: buy_orders[counter]
              })
            );

            blockchain.receipt(
              JSON.stringify({
                txType: "user-record",
                orderType: "buy",
                orderID: buy_orders[counter].orderID,
                symbol: buy_orders[counter].symbol,
                user: buy_orders[counter].account,
                price: buy_orders[counter].price,
                amount: buy_orders[counter].currentFullfilled,
                time: block.time,
                volume: volume,
                status: buy_orders[counter].orderStatus,
                order: buy_orders[counter]
              })
            );
          } else {
            let totalAmountIostNecessary =
              amountNecessary * buy_orders[counter].price;

            //we take the rest of the outstanding amount
            buyerTokenBal = blockchain.callWithAuth("token.iost", "balanceOf", [
              tokenSymbol,
              buy_orders[counter].account
            ]);

            //overflow check
            if (userIOSTBalance + totalAmountIostNecessary < userIOSTBalance) {
              throw "Invalid sum results. ";
            }

            if (buyerTokenBal + amountNecessary < buyerTokenBal) {
              throw "Invalid sum results. ";
            }

            //this guy offers more than we ask for. We reduce his stack, add the iost to us and the symbolName to him.
            buy_orders[counter].amount = (
              buy_orders[counter].amount * 1 -
              amountNecessary
            )
              .toFixed(tokenDecimal)
              .toString();

            buy_orders[counter].currentFullfilled = (
              buy_orders[counter].currentFullfilled * 1 +
              amountNecessary
            )
              .toFixed(tokenDecimal)
              .toString();

            buy_orders[counter].updatedTime = block.time;
            storage.mapPut(
              "orders",
              buy_orders[counter].orderID,
              JSON.stringify(buy_orders[counter])
            );

            //Receive iost from contract.
            this._transferToken(
              "iost",
              blockchain.contractName(),
              tx.publisher,
              (totalAmountIostNecessary * (1 - sellerFee)).toFixed(8).toString()
            );

            //Transfer fees from buyer and seller to lottery account
            let buyFee =
              amount * buy_orders[counter].price * buy_orders[counter].fee;
            let sellFee = amount * buy_orders[counter].price * sellerFee;
            let buyerRef = buy_orders[counter].referee;

            if (referee !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                referee,
                (sellFee * 0.25).toFixed(iostDecimal).toString()
              );

              sellFee = sellFee * 0.75;
            }

            if (buyerRef !== null) {
              this._transferToken(
                "iost",
                blockchain.contractName(),
                buyerRef,
                (buyFee * 0.25).toFixed(iostDecimal).toString()
              );

              buyFee = buyFee * 0.75;
            }

            let total_fee = buyFee + sellFee;

            this._transferToken(
              "iost",
              blockchain.contractName(),
              lottAdmin,
              total_fee.toFixed(8).toString()
            );

            //Buyer receives tokens
            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              buy_orders[counter].account,
              amountNecessary.toFixed(tokenDecimal).toString()
            );

            volume += amountNecessary.toFixed(tokenDecimal);

            order.currentFullfilled = (
              order.currentFullfilled * 1 +
              amountNecessary
            )
              .toFixed(tokenDecimal)
              .toString();

            order.orderStatus = "completed";
            order.updatedTime = block.time;
            order.amount = "0";
            amountNecessary = 0;
            //we have fulfilled our order

            blockchain.receipt(
              JSON.stringify({
                txType: "price-action",
                orderType: "sell",
                orderID: buy_orders[counter].orderID,
                symbol: buy_orders[counter].symbol,
                user: buy_orders[counter].account,
                price: buy_orders[counter].price,
                amount: order.initialAmount,
                time: block.time,
                volume: volume,
                status: buy_orders[counter].orderStatus,
                order: buy_orders[counter]
              })
            );

            blockchain.receipt(
              JSON.stringify({
                txType: "user-record",
                orderType: "buy",
                orderID: buy_orders[counter].orderID,
                symbol: buy_orders[counter].symbol,
                user: buy_orders[counter].account,
                price: buy_orders[counter].price,
                amount: buy_orders[counter].currentFullfilled,
                time: block.time,
                volume: volume,
                status: buy_orders[counter].orderStatus,
                order: buy_orders[counter]
              })
            );
          }

          if (amountNecessary > 0) {
            counter++;
          }
        }

        if (amountNecessary > 0) {
          storage.mapPut("orders", order.orderID, JSON.stringify(order));
        } else {
          this._deleteOrder(order.orderID);
          order.orderStatus = "completed";
          order.amount = "0";
          //add a ticket to our order
          this._addTicket(order.account);
        }
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

    let newLength = this._checkOrderStart();
  }

  ////////////////////////////
  // SELL LIMIT ORDER LOGIC //
  ////////////////////////////
  sellToken(tokenSymbol, price, amount, referee) {
    this._assertAccountAuth(cadmin);

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
    let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

    let sellerFee = this._tradeFeesDiscount(tx.publisher) * 1;

    let userTokenBalance = blockchain.callWithAuth("token.iost", "balanceOf", [
      tokenSymbol,
      tx.publisher
    ]);

    //overflow test
    if (userTokenBalance * 1 < amount || userTokenBalance - amount * 1 < 0) {
      throw "Insufficient token balance. ";
    }

    if (userTokenBalance * 1 - amount * 1 > userTokenBalance) {
      throw "Invalid difference results. ";
    }

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

    storage.mapPut("orders", order.orderID, JSON.stringify(order));
    return order.orderID;
  }

  //////////////////////////////
  // CANCEL LIMIT ORDER LOGIC //
  //////////////////////////////
  cancelOrder(orderID) {
    this._assertAccountAuth(cadmin);
    let order = JSON.parse(storage.mapGet("orders", orderID));

    if (order.orderStatus == "cancelled" || order.orderStatus == "completed") {
      throw "This orders is already cancelled or completed. ";
    }

    //checks to make sure that the user cancelling the order is indeed the same person who requested the order.
    if (order.account !== tx.publisher) {
      throw "You are not authorized to cancel this order. ";
    }

    let totalIostRefund = order.amount * order.price * (1 * order.fee + 1);

    //Checks to see if it is a sell order.  If true, then cancel the sell order.  Else cancel the buy order.
    if (order.isBuy == false) {
      //Smart contract refunds the user the remainder of tokens in the order.
      this._transferToken(
        order.symbol,
        blockchain.contractName(),
        tx.publisher,
        (order.amount * 1)
          .toFixed(storage.mapGet("tokens", order.symbol) * 1)
          .toString()
      );
    }

    //cancels the buy order.
    else {
      //Blockchain refunds the user the amount.
      this._transferToken(
        "iost",
        blockchain.contractName(),
        tx.publisher,
        totalIostRefund.toFixed(8).toString()
      );
    }

    let orderLength = this._checkOrderStart();

    //Check if user can get a ticket
    if (order.amount * 1 < order.initialAmount * 1) {
      this._addTicket(order.account);
    }

    order.orderStatus = "cancelled";
    order.updatedTime = block.time;
    this._deleteOrder(orderID);

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

  //Check to make sure that the account is authorized to perform a function.
  _assertAccountAuth(account) {
    if (!blockchain.requireAuth(account, "active")) {
      throw "Authorization Failure";
    }
  }

  //Check to make sure that the account is authorized to perform a function.
  _tempAccountAuth() {
    if (!blockchain.requireAuth("otb_admin", "active")) {
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

  //Deletes an order from the storage after completed or cancelled.
  _deleteOrder(orderID) {
    storage.mapDel("orders", orderID);
  }

  //returns an order id generated by the contract.
  _generateOrderID() {
    let id = storage.get("orderID") * 1;
    let newID = id + 1;
    storage.put("orderID", newID.toString());
    return id.toString();
  }

  //sort arrays, based on price
  _orderBuySorter(array) {
    let new_array = array.sort(function (a, b) {
      return b.price - a.price;
    });
    return new_array;
  }

  //sort arrays, based on price
  _orderSellSorter(array) {
    let new_array = array.sort(function (a, b) {
      return a.price - b.price;
    });
    return new_array;
  }

  //assigns a token Id to a token when listed.
  _generateTokenId() {
    let id = storage.get("tokenID") * 1;
    let new_id = id + 1;
    storage.put("tokenID", new_id.toString());
    return id.toString();
  }

  //transfers tokens/iost
  _transferToken(tokenSymbol, from, to, amount) {
    let args = [
      tokenSymbol,
      from,
      to,
      amount,
      amount + " " + tokenSymbol + " got transfered from " + from + " to " + to
    ];

    blockchain.callWithAuth("token.iost", "transfer", JSON.stringify(args));
  }

  // ----------------------------------------------------------------------------------------------------------

  initKeysForOrderBooks(tokenSymbol) {
    storage.mapPut(
      "buy-orders-" + tokenSymbol,
      "price-keys",
      JSON.stringify([])
    );
    storage.mapPut(
      "sell-orders-" + tokenSymbol,
      "price-keys",
      JSON.stringify([])
    );
  }

  //Checks first to see if there are any sell orders at all.
  //Checks if the new buy order is greater than or equal to the current lowest sell price.
  _checkNewBuyGTESellLowest(tokenSymbol, buyPrice) {
    let sellPrices = JSON.parse(
      storage.mapGet("sell-orders-" + tokenSymbol, "price-keys")
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
      storage.mapGet("buy-orders-" + tokenSymbol, "price-keys")
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
      storage.mapGet("buy-orders-" + tokenSymbol, "price-keys")
    );
    let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

    if (!buyPrices.length || !buyPrices.includes(buyOrder.price * 1)) {
      buyPrice.push(buyOrder.price * 1);
      let sortePrices = buyPrices.sort(function (a, b) {
        return b - a;
      });
      storage.mapPut(
        "buy-orders-" + tokenSymbol,
        "price-keys",
        JSON.stringify(sortePrices)
      );
      storage.mapPut(
        "buy-orders-" + tokenSymbol,
        (buyOrder.price * 1).toFixed(tokenDecimal).toString(),
        JSON.stringify({
          amount: buyOrder.amount * 1,
          orders: [buyOrder.orderID]
        })
      );
    } else {
      let json = JSON.parse(
        storage.mapGet(
          "buy-orders-" + tokenSymbol,
          (buyOrder.price * 1).toFixed(tokenDecimal).toString()
        )
      );
      json.amount += buyOrder.amount * 1;
      json.orders.push(buyOrder.orderID);
      storage.mapPut(
        "buy-orders-" + tokenSymbol,
        (buyOrder.price * 1).toFixed(tokenDecimal).toString(),
        JSON.stringify(json)
      );
    }
  }

  //Check if there are any sell prices at all.
  _checkNewSellExists(tokenSymbol, sellOrder) {
    let sellPrices = JSON.parse(
      storage.mapGet("sell-orders-" + tokenSymbol, "price-keys")
    );
    let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

    if (!sellPrices.length || !sellPrices.includes(sellOrder.price * 1)) {
      sellPrices.push(sellOrder.price * 1);
      let sortePrices = sellPrices.sort(function (a, b) {
        return a - b;
      });
      storage.mapPut(
        "sell-orders-" + tokenSymbol,
        "price-keys",
        JSON.stringify(sortePrices)
      );
      storage.mapPut(
        "sell-orders-" + tokenSymbol,
        (sellOrder.price * 1).toFixed(tokenDecimal).toString(),
        JSON.stringify({
          amount: sellOrder.amount * 1,
          orders: [sellOrder.orderID]
        })
      );
    } else {
      let json = JSON.parse(
        storage.mapGet(
          "sell-orders-" + tokenSymbol,
          (sellOrder.price * 1).toFixed(tokenDecimal).toString()
        )
      );
      json.amount += sellOrder.amount * 1;
      json.orders.push(sellOrder.orderID);
      storage.mapPut(
        "sell-orders-" + tokenSymbol,
        (sellOrder.price * 1).toFixed(tokenDecimal).toString(),
        JSON.stringify(json)
      );
    }
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
      orderType = "buy-orders-";
    } else {
      orderType = "sell-orders-";
    }

    let priceOrder = JSON.parse(
      storage.mapGet(
        orderType + tokenSymbol,
        price.toFixed(tokenDecimal).toString()
      )
    );

    if (priceOrder.orders.includes(order.id)) {
      priceOrder.orders = priceOrder.orders.filter(function (or) {
        return or !== order.orderID;
      });

      priceOrder.amount -= amount;

      storage.mapPut(
        orderType + tokenSymbol,
        price.toFixed(tokenDecimal).toString(),
        JSON.stringify(priceOrder)
      );
    }


    storage.mapPut(order.account, tokenSymbol, JSON.stringify(userOrders));
    storage.mapDel("orders", order.orderID);
  }

  //updates order at user and order book.
  _updateOrder(tokenSymbol, order, amountNecessary) {
    storage.mapPut("orders", order.orderID, JSON.stringify(order));

    let orderType;

    if (order.isBuy) {
      orderType = "buy-orders-";
    } else {
      orderType = "sell-orders-";
    }

    let priceOrder = JSON.parse(
      storage.mapGet(
        orderType + tokenSymbol,
        (order.price * 1).toFixed(tokenDecimal).toString()
      )
    );

    //if the orders does not include the updated id, it means it's a new order so add it to the stack. 
    if (!priceOrder.orders.includes(order.id)) {
      price.order.push(order.orderID)

    }

    priceOrder.amount -= (amountNecessary * 1);

    storage.mapPut(
      orderType + tokenSymbol,
      (order.price * 1).toFixed(tokenDecimal).toString(),
      JSON.stringify(priceOrder)
    );


  }

  //Test new handle
  //_checkNewBuyGTESellLowest(tokenSymbol, buyPrice) return bool
  //_checkNewSellLTEBuyHighest(tokenSymbol, sellPrice) return bool
  //_checkNewBuyExists(tokenSymbol, buyOrder) modifies orderbook when no sell orders can fullfill
  //_checkNewSellExists(tokenSymbol, sellOrder) modifies orderbook when no buy orders can fullfill

  newHandleTrade(orderID) {
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
    let price = order.price;
    let tokenDecimal = storage.mapGet("tokens", tokenSymbol) * 1;

    //check if this is a buy or sell order
    if (order.isBuy) {
      //this is a buy order.

      //check if there are sell orders that can fullfill buy order
      if (this._checkNewBuyGTESellLowest(tokenSymbol, price)) {
        //Check sell order book from lowest to highest.
        let sellPrices = JSON.parse(
          storage.mapGet("sell-orders-" + tokenSymbol, "price-keys")
        );
        let counter = 0;
        let orderAmount = order.amount * 1;
        let leftOver = order.amount * order.price;
        let sellOrders = [];

        //Get all sell orders that can be fulfilled.  
        while (price >= sellPrices[counter] && orderAmount > 0) {
          let priceContainer = JSON.parse(
            storage.mapGet(
              "sell-orders-" + tokenSymbol,
              sellPrices[counter].toFixed(tokenDecimal).toString()
            )
          );
          let priceAmount = priceContainer.amount;
          let priceOrders = priceContainer.orders;

          sellOrders = sellOrders.concat(priceOrders);
          orderAmount -= priceAmount;
          lastAmount = priceAmount;
          counter++;
        }

        let amountNecessary = order.amount * 1;
        let newCounter = 0;

        while (amountNecessary > 0 && price >= JSON.parse(storage.mapGet("orders", sellOrders[newCounter])).price) {
          let sOrder = JSON.parse(storage.mapGet("orders", sellOrders[newCounter]));
          let sOrderIOST = sOrder.price * sOrder.amount;
          let vol = 0;

          if (sOrder.amount < amountNecessary) {
            //Complete the seller's order.   

            //Seller receives iost from BC
            this._transferToken(
              "iost",
              blockchain.contractName(),
              sOrder.account,
              (sOrderIOST).toFixed(iostDecimal).toString()
            );

            //decrement leftover based on totaliost in the order.
            leftOver -= sOrderIOST;

            //increment volume
            vol += (sOrder.amount * 1);

            //You receive tokens from blockchain.  
            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              order.account,
              (sOrder.amount * 1).toFixed(tokenDecimal).toString()
            );

            //decrement your current amount.  
            amountNecessary -= (sOrder.amount * 1);

            //update and delete seller's order
            sOrder.currentFullfilled = (sOrder.currentFullfilled * 1 + sOrder.amount * 1).toString();
            sOrder.amount = "0";
            sOrder.updatedTime = block.time;
            sOrder.orderStatus = "completed";

            this._delOrder(sOrder, tokenSymbol);

            //blockchain receipt
            blockchain.receipt(
              JSON.stringify({
                txType: "price-action",
                orderType: "buy",
                orderID: sOrder.orderID,
                symbol: sOrder.symbol,
                user: sOrder.account,
                price: sOrder.price,
                amount: sOrder.initialAmount,
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
          else {
            //You have less than the seller's amount. complete your order.  Update seller's order. 

            //You receive tokens from BC
            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              order.account,
              (amountNecessary).toFixed(tokenDecimal).toString()
            );

            //Seller receives iost from BC
            this._transferToken(
              "iost",
              blockchain.contractName(),
              sOrder.account,
              (amountNecessary * sOrder.price).toFixed(iostDecimal).toString()
            );

            //decrement leftover based on totaliost in the order.
            leftOver -= (amountNecessary * sOrder.price);

            //increment volume
            vol += amountNecessary;

            //update seller's order
            sOrder.currentFullfilled = (sOrder.currentFullfilled * 1 + amountNecessary).toString();
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
                amount: sOrder.initialAmount,
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

        }

        if (leftOver > 0) {
          //You receive leftover iost from BC
          this._transferToken(
            "iost",
            blockchain.contractName(),
            order.account,
            (leftOver).toFixed(iostDecimal).toString()
          );
        }

        //update the amounts in your order.  
        order.currentFullfilled = (order.initialAmount * 1 - amountNecessary).toString();
        order.amount = amountNecessary.toString();
        order.updatedTime = block.time;

        //Your amount has been fulfilled.  Complete and delete your order.  
        if (order.amount == 0) {
          order.orderStatus = "completed";

          this._delOrder(order, tokenSymbol);

        } else {
          this._updateOrder(tokenSymbol, order, (amountNecessary * -1));
        }


      } else {
        //There are no sell orders to fullfill the order so add the order to orderbook.
        this._checkNewBuyExists(tokenSymbol, order);
      }
    } else {
      //this is a sell order.

      //check if there are buy orders that can fullfill order
      if (this._checkNewSellLTEBuyHighest(tokenSymbol, price)) {
        //Check buy order book from highest to lowest.

        let buyPrices = JSON.parse(
          storage.mapGet("buy-orders-" + tokenSymbol, "price-keys")
        );
        let counter = 0;
        let orderAmount = order.amount * 1;
        let buyOrders = [];

        //Get all buy orders that can be fulfilled.  
        while (price <= buyPrices[counter] && orderAmount > 0) {
          let priceContainer = JSON.parse(
            storage.mapGet(
              "buy-orders-" + tokenSymbol,
              buyPrices[counter].toFixed(tokenDecimal).toString()
            )
          );
          let priceAmount = priceContainer.amount;
          let priceOrders = priceContainer.orders;

          buyOrders = buyOrders.concat(priceOrders);
          orderAmount -= priceAmount;
          counter++;
        }

        let amountNecessary = order.amount * 1;
        let newCounter = 0;

        while (amountNecessary > 0 && price <= JSON.parse(storage.mapGet("orders", buyOrders[newCounter])).price) {
          let bOrder = JSON.parse(storage.mapGet("orders", buyOrders[newCounter]));
          let bOrderIOST = bOrder.price * bOrder.amount;
          let vol = 0;

          if (bOrder.amount < amountNecessary) {
            //Complete the buyers's order.   

            //You receive iost from BC
            this._transferToken(
              "iost",
              blockchain.contractName(),
              order.account,
              (bOrderIOST).toFixed(iostDecimal).toString()
            );


            //buyer receives tokens from blockchain.  
            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              bOrder.account,
              (bOrder.amount * 1).toFixed(tokenDecimal).toString()
            );

            //decrement your current amount.  
            amountNecessary -= (bOrder.amount * 1);

            //increment volume
            vol += (bOrder.amount * 1)

            //update and delete buyer's order
            bOrder.currentFullfilled = (bOrder.currentFullfilled * 1 + bOrder.amount * 1).toString();
            bOrder.amount = "0";
            bOrder.updatedTime = block.time;
            bOrder.orderStatus = "completed";

            this._delOrder(bOrder, tokenSymbol);

            //blockchain receipt
            blockchain.receipt(
              JSON.stringify({
                txType: "price-action",
                orderType: "sell",
                orderID: bOrder.orderID,
                symbol: bOrder.symbol,
                user: bOrder.account,
                price: bOrder.price,
                amount: bOrder.initialAmount,
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
          else {
            //You have less than the buyer's amount. complete your order.  Update buyer's order. 

            //Buyer receive tokens from BC
            this._transferToken(
              tokenSymbol,
              blockchain.contractName(),
              bOrder.account,
              (amountNecessary).toFixed(tokenDecimal).toString()
            );

            //You receive iost from BC
            this._transferToken(
              "iost",
              blockchain.contractName(),
              order.account,
              (amountNecessary * bOrder.price).toFixed(iostDecimal).toString()
            );

            //increment volume
            vol += amountNecessary;

            //update buyer's order
            bOrder.currentFullfilled = (bOrder.currentFullfilled * 1 + amountNecessary).toString();
            bOrder.amount = (bOrder.amount * 1 - amountNecessary).toString();
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
                amount: bOrder.initialAmount,
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
        }

        //update the amounts in your order.  
        order.currentFullfilled = (order.initialAmount * 1 - amountNecessary).toString();
        order.amount = amountNecessary.toString();
        order.updatedTime = block.time;

        //Your amount has been fulfilled.  Complete and delete your order.  
        if (order.amount == 0) {
          order.orderStatus = "completed";

          this._delOrder(order, tokenSymbol);

        } else {
          this._updateOrder(tokenSymbol, order, (amountNecessary * -1));
        }

      } else {
        //There are no sell orders to fullfill the order so add the order to orderbook.
        this._checkNewSellExists(tokenSymbol, order);
      }
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
}

module.exports = Exchange;
