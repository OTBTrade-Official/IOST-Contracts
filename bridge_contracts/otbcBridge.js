const admin = "otb_admin";
const supportChains = [56, 137, 250, 43114];

// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class OTBCBridge {
  init() {
    storage.put("id", "0");
    storage.put("manager", "otb_admin");
    storage.put("pendings", JSON.stringify([]));
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
  bridgeToken(evmAddress, amount, chain) {
    if (amount < 5) {
      throw "Amount < 5 OTBC's. ";
    }

    if (!supportChains.includes(chain)) {
      throw "Unsupported chain.";
    }

    this._transfer(
      "otbc",
      tx.publisher,
      blockchain.contractName(),
      this._fixedNum(amount),
      "User transfers OTBC to bridge contract."
    );
    const id = this._assignId();

    const bridgeTX = {
      hash: tx.hash,
      id: id,
      user: tx.publisher,
      chain: chain,
      chainTx: "N/A",
      amount: amount,
      address: evmAddress,
      time: block.time,
      status: "PENDING",
    };

    this._mP("bridge", id.toString(), JSON.stringify(bridgeTX), tx.publisher);
    const pendings = JSON.parse(this._g("pendings"));
    pendings.push(id);
    this._p("pendings", JSON.stringify(pendings), tx.publisher);

    if (this._mH("user", tx.publisher)) {
      const userActions = JSON.parse(this._mG("user", tx.publisher));
      userActions.push(id);
      this._mP("user", tx.publisher, JSON.stringify(userActions), tx.publisher);
    } else {
      this._mP("user", tx.publisher, JSON.stringify([id]), tx.publisher);
    }
  }

  // Manager updates the bridge transaction of the specified ID.
  updateBridgeTx(id, evmTXHash) {
    this._isManager();

    const bridgeTx = JSON.parse(this._mG("bridge", id.toString()));

    bridgeTx.chainTx = evmTXHash;
    bridgeTx.status = "COMPLETED";
    this._mP("bridge", id.toString(), JSON.stringify(bridgeTx));

    const pendings = JSON.parse(this._g("pendings"));
    const newPendings = pendings.filter((p) => p !== id);
    this._p("pendings", JSON.stringify(newPendings));

    //destroy tokens
    let args = [
      "otbc",
      blockchain.contractName(),
      this._fixedNum(bridgeTx.amount),
    ];
    blockchain.callWithAuth("token.iost", "destroy", JSON.stringify(args));
  }

  // Update manager
  updateManager(newManager) {
    this._isManager();
    this._p("manager", newManager);
  }

  _assignId() {
    const id = JSON.parse(this.g("id"));
    this.p("id", (id + 1).toString(), tx.publisher);
    return id;
  }

  // Returns the manager
  _isManager() {
    return tx.publisher === this._g("manager");
  }

  // returns a fixed precision number.
  _fixedNum(num) {
    return new Float64(num).toFixed(8);
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

module.exports = OTBCBridge;
