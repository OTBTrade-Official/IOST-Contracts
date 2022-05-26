const admin = "otb_admin";

// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class mockContract {
  init() {
    storage.put("manager", "otb_admin");
  }

  //Only owner can update.
  can_update(data) {
    return blockchain.requireAuth(admin, "active");
  }

  //Used to update errors when needed.
  updateInit() {
    this._assertAccountAuth(admin);
  }

  // Bridge your tokens to the specified EVM chain.
  bridgeToken(evmAddress, amount, chain) {}

  // Update manager
  updateManager(newManager) {
    this._isManager(tx.publisher);
    this._p("manager", newManager);
  }

  // Returns the manager
  _isManager(mgr) {
    return mgr === this._g("manager");
  }

  // returns a fixed precision number.
  _fixedNum(num, decimal) {
    return new Float64(num).toFixed(decimal);
  }

  // Returns value in the respective key
  _g(k) {
    return storage.get(k);
  }

  // Returns a value in the mapping
  _mG(k, f) {
    return storage.mapGet(k, f);
  }

  // Updates a value in the respective key
  _p(k, v, u) {
    storage.put(k, v, u);
  }

  // Updates storage mapping
  _mP(k, f, v, u) {
    storage.mapPut(k, f, v, u);
  }

  // Returns a bool
  _h(k) {
    return storage.has(k);
  }

  // Returns a bool
  _mH(k, f) {
    return storage.mapHas(k, f);
  }

  //Check to make sure that the account is authorized to perform a function.
  _assertAccountAuth(account) {
    if (!blockchain.requireAuth(account, "active")) {
      throw "Authorization Failure";
    }
  }

  //transfers tokens/iost
  _transfer(tokenSymbol, from, to, amount, memo) {
    let args = [tokenSymbol, from, to, amount, memo];

    blockchain.callWithAuth("token.iost", "transfer", JSON.stringify(args));
  }
}

module.exports = mockContract;
