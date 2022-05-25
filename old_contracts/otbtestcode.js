class Exchange {
  init() {
    //stores orders in an orderbook.

    storage.put('orderID', '1');
    storage.put('lotteryID', '1');
  }

  listToken(tokenSymbol, decimal) {
    this._assertAccountAuth(cadmin);

    if (storage.mapHas('tokens', tokenSymbol)) {
      throw 'Token is already listed.';
    }

    storage.mapPut('tokens', tokenSymbol, decimal);
    storage.put(arrayCounter, '1');
  }

  //Takes a symbol and order and checks to see
  checkArrayLimit(order) {
    if (!storage.mapHas('tokens', tokenSymbol)) {
      throw 'This token is not listed.';
    }

    //checks to make sure users don't trade iost/iost pair.
    if (tokenSymbol === 'iost') {
      throw 'iost/iost is not a valid trade pair. ';
    }

    let count = 0;
    let didProcess = false;
    while (didProcess === false) {
      if (
        !storage.mapLen(tokenSymbol + ':orders', count.toString()) ||
        storage.mapLen(tokenSymbol + ':orders', count.toString()) < 256
      ) {
        storage.mapPut(
          tokenSymbol + ':orders',
          count.toString(),
          JSON.stringify(order)
        );
        didProcess = true;
      } else {
        count++;
        if (count >= storage.get(tokenSymbol + ':arrayCounter') * 1) {
          storage.put(tokenSymbol + ':arrayCounter', (count + 1).toString());
        }
      }
    }
  }

  deListToken(tokenSymbol) {}

  buy(tokenSymbol, price, amount) {
    //Checks to see if token is listed.
    if (!storage.mapHas('tokens', tokenSymbol)) {
      throw 'This token is not listed.';
    }

    //checks to make sure users don't trade iost/iost pair.
    if (tokenSymbol === 'iost') {
      throw 'iost/iost is not a valid trade pair. ';
    }

    //Users must trade more than the value of 10 Iost.
    if (price * amount < 10) {
      throw 'Total iost trade value must be greater than 10. ';
    }

    //makes sure price and amount is not lower than zero.
    if (price * 1 <= 0 || amount * 1 <= 0) {
      throw 'Price and amount must be greater than zero. ';
    }

    //makes sure that price and amount are valid numbers.
    if (typeof (price * 1) !== 'number' || typeof (amount * 1) !== 'number') {
      throw 'Price and amount must be a valid number and not a string. ';
    }

    let buyerFee = this._tradeFeesDiscount(tx.publisher) * 1;
    let totalAmountIostNecessary = amount * price;
    let totalIostWithFees = totalAmountIostNecessary * (1 + buyerFee);

    let userBalance = blockchain.callWithAuth('token.iost', 'balanceOf', [
      'iost',
      tx.publisher
    ]);

    //check to make sure user balance is greater than the total expense.
    if (
      userBalance < totalIostWithFees ||
      userBalance - totalIostWithFees < 0
    ) {
      throw 'Insufficient balance';
    }

    //create an order entry
    let order = this._createOrder(
      tx.publisher,
      tokenSymbol,
      amount,
      price,
      true,
      buyerFee.toString()
    );

    //Statement returns true, therefore we will create a buy limit order.
    let transferedIost = totalIostWithFees.toFixed(iostDecimal);
    this._transferToken(
      'iost',
      tx.publisher,
      blockchain.contractName(),
      transferedIost.toString()
    );

    storage.mapPut('orders', order.orderID, JSON.stringify(order));
    return order.orderID;
  }

  //Keep track of array container using the blockchain.storage.mapkey().
  //This will keep track of the container's length and make sure it's less than 256
  //Once the container reaches 256 orders, it will increment to the next array container.
  //But when adding new orders system will always check the ealier containers to see if it has enough.
  //When pulling data, it will use the blockchain
  sell(tokenSymbol, price, amount) {}

  handleTrade(orderID) {}

  cancelOrder(orderID) {}

  _getBuyOrders(tokenSymbol) {}

  _getSellOrders(tokenSymbol) {}
}
