const name = 'otbc';
const fullName = 'otbc'; //It is recommended that the wallet and browser display the name of the currency as "fullName(name)", for example: YTK(your_token)
const decimal = 8;
const totalSupply = 100000000;
const admin = 'otb_admin';

class OtbToken {
  init() {
    let arg = [
      name,
      blockchain.contractName(),
      totalSupply,
      {
        fullName,
        decimal,
        canTransfer: true,
        onlyIssuerCanTransfer: false
      }
    ];
    blockchain.callWithAuth('token.iost', 'create', JSON.stringify(arg));
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), 'active');
  }

  updateInit() {
    this._assertAccountAuth(blockchain.contractOwner());
  }

  _amount(amount) {
    return new BigNumber(new BigNumber(amount).toFixed(decimal));
  }

  _checkToken(token_name) {
    if (token_name !== name) {
      throw 'token not exist';
    }
  }

  issue(token_name, to, amount) {
    if (!blockchain.requireAuth(admin, 'active')) {
      throw 'permission denied';
    }
    this._checkToken(token_name);
    amount = this._amount(amount);
    blockchain.callWithAuth('token.iost', 'issue', [token_name, to, amount]);
  }

  transfer(token_name, from, to, amount, memo) {
    this._checkToken(token_name);
    amount = this._amount(amount);
    blockchain.callWithAuth('token.iost', 'transfer', [
      token_name,
      from,
      to,
      amount,
      memo
    ]);
  }

  transferFreeze(token_name, from, to, amount, timestamp, memo) {
    this._checkToken(token_name);
    amount = this._amount(amount);
    blockchain.callWithAuth('token.iost', 'transferFreeze', [
      token_name,
      from,
      to,
      amount,
      timestamp,
      memo
    ]);
  }

  destroy(token_name, from, amount) {
    this._checkToken(token_name);
    amount = this._amount(amount);
    blockchain.callWithAuth('token.iost', 'destroy', [
      token_name,
      from,
      amount
    ]);
  }

  //pays otbc's to voters.  
  payVoteRewards(data){
    this._assertAccountAuth(blockchain.contractOwner());
    let voters = JSON.parse(data);
    
    voters.forEach(voter => {
      let amount = voter.votes / 250000
      blockchain.callWithAuth('token.iost', 'issue', ['otbc', voter.account, amount.toFixed(8)]);
    })
  }

  payVoterReward(account, votes){
    this._assertAccountAuth(blockchain.contractOwner());
    let amount = votes / 250000
    blockchain.callWithAuth('token.iost', 'issue', ['otbc', account, amount.toFixed(8)]);
  }

  //locks tokens on contract to send to ETH. 
  transferToETH(amount){
    this._assertAccountAuth(blockchain.contractOwner());

    if(!storage.has("sentToETH")){
      storage.put("sentToETH", amount);
    }
    else {
      let sentToETH = storage.get("sentToETH") * 1 + amount * 1; 
      storage.put("sentToETH", sentToETH.toFixed(8));
    }

    blockchain.callWithAuth('token.iost', 'transfer', [
      "otbc",
      tx.publisher,
      blockchain.contractName(),
      amount,
      amount + " OTBC's got transfered to the ETH chain. "
    ]);

  }

  //Check to make sure that the account is authorized to perform a function.
  _assertAccountAuth(account) {
    if (!blockchain.requireAuth(account, "active")) {
      throw "Authorization Failure";
    }
  }

  // call abi and parse result as JSON string
  _call(contract, api, args) {
    const ret = blockchain.callWithAuth(contract, api, args);
    if (ret && Array.isArray(ret) && ret.length >= 1) {
      return ret[0];
    }
    return null;
  }

  balanceOf(token_name, owner) {
    this._checkToken(token_name);
    return this._call('token.iost', 'balanceOf', [token_name, owner]);
  }

  supply(token_name) {
    this._checkToken(token_name);
    return this._call('token.iost', 'supply', [token_name]);
  }

  totalSupply(token_name) {
    this._checkToken(token_name);
    return this._call('token.iost', 'totalSupply', [token_name]);
  }

  //First transfer freeze  1609484400000000000 for date.  
  //Amount:  
}

module.exports = OtbToken;
