
const cadmin = "otb_admin";


// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class OTBStakes {
  init() {
    //initialize the total staked. 
    storage.put("totalStakes", "0");

    //initialize the user keys
    storage.put("userKeys", JSON.stringify([]));

    //initialize demo user. 
    storage.mapPut("users", "otbtrade", "0");

  }

  //Only owner can update.
  can_update(data) {
    return blockchain.requireAuth(cadmin, "active");
  }

  //Used to update errors when needed. 
  updateInit() {
    this._assertAccountAuth(cadmin);
    storage.put("totalRewards", "17875");
  }


  /*      Manage Stakes                                    */


  //Users can stake otbc's on the contract to earn voting rewards from the block.  
  stake(amt){
    this._checkStakingPower(amt, tx.publisher);

    amt *= 1;
    let stakeBal;

    //checks if user already is a staker
    if (storage.mapHas("users", tx.publisher)) {
      stakeBal = storage.mapGet("users", tx.publisher) * 1;
    }
    else {
      let arr = JSON.parse(storage.get("userKeys"));
      arr.push(tx.publisher);
      storage.put("userKeys", JSON.stringify(arr));
      stakeBal = 0;
    }

    stakeBal += amt; 
    storage.mapPut("users", tx.publisher, stakeBal.toFixed(8).toString());

    let total_staked = storage.get("totalStakes") * 1;
    total_staked += amt;
    storage.put("totalStakes", total_staked.toFixed(8).toString());

    //User stakes otbc on the contract
    this._transferToken('otbc', tx.publisher, blockchain.contractName(), amt.toFixed(8).toString(), 'User stakes OTBC on otbTrade. ');

    
  }

  //unstakes with freezing
  unstakeFreeze(amt){
    this._checkUnstakeAmount(amt, tx.publisher);
    amt *= 1;
    //update total staked.
    let total_staked = storage.get("totalStakes") * 1;
    total_staked -= amt;
    storage.put("totalStakes", total_staked.toFixed(8).toString());

    //update user staked. 
    let stakeBal = storage.mapGet("users", tx.publisher) * 1;
    stakeBal -= amt;

    if(stakeBal.toFixed(8) * 1 === 0){
      storage.mapDel("users", tx.publisher);
      let arr = JSON.parse(storage.get("userKeys"));
      arr = arr.filter(user => user !== tx.publisher);
      storage.put("userKeys", JSON.stringify(arr));
    }
    else{
      storage.mapPut("users", tx.publisher, stakeBal.toFixed(8).toString());
    }

    //User unstakes otbc on the contract
    this._transferFreezeToken('otbc', blockchain.contractName(), tx.publisher, amt.toFixed(8).toString(), 'User unstakes OTBC on otbTrade. 3 days freeze. ');

  }

  //unstakes without freezing, but a 1% fee of otbc's will be deducted.  
  unstakeNoFreeze(amt) {
    this._checkUnstakeAmount(amt, tx.publisher);
    amt *= 1;
    //update total staked.
    let total_staked = storage.get("totalStakes") * 1;
    total_staked -= amt;
    storage.put("totalStakes", total_staked.toFixed(8).toString());

    //update user staked. 
    let stakeBal = storage.mapGet("users", tx.publisher) * 1;
    stakeBal -= amt;

    if (stakeBal.toFixed(8) * 1 === 0) {
      storage.mapDel("users", tx.publisher);
      let arr = JSON.parse(storage.get("userKeys"));
      arr = arr.filter(user => user !== tx.publisher);
      storage.put("userKeys", JSON.stringify(arr));
    }
    else {
      storage.mapPut("users", tx.publisher, stakeBal.toFixed(8).toString());
    }

    let fee = amt * .01;
    let final = amt * .99;

    //User unstakes otbc on the contract
    this._transferToken('otbc', blockchain.contractName(), tx.publisher, final.toFixed(8).toString(), 'User unstakes OTBC on otbTrade. Fast unstake. ');
    this._transferToken('otbc', blockchain.contractName(), 'otb_dev', fee.toFixed(8).toString(), 'User unstakes OTBC on otbTrade. Fast unstake. ');
  }

  //Unstake with no fees but will will take 3 days to unfreeze.  
  _checkUnstakeAmount(amt, account){
    if (amt * 0 !== 0) {
      throw "Your amount is not a valid number.  "
    }

    if (amt * 1 <= 0) {
      throw "Your amount cannot be less than zero.  "
    }

    if(!storage.mapHas("users", account)){
      throw "You don't have OTBC's Staked. "
    }

    if (storage.mapGet("users", account) * 1 - amt * 1 < 0 ) {
      throw "You don't have enough stakes to unstake the specified amount. "
    }

  }

  

  //checks to make sure user has iost voted on otb_admin and the amount is sufficient. 
  _checkStakingPower(amt, account){
    if(amt * 0 !== 0 ){
      throw "Your amount is not a valid number.  "
    }

    if (amt * 1 <= 0) {
      throw "Your amount cannot be less than zero.  "
    }

    if (!storage.globalMapHas('vote.iost', 'u_1', account)){
      throw "You have not voted IOST yet. "
    }

    let data = JSON.parse(storage.globalMapGet('vote.iost', 'u_1', account));

    if(!data['otb_admin']){
      throw "You have not voted for the otb node.  "
    }

    let stakeBal = 0;
    //checks if user already is a staker
    if (storage.mapHas("users", tx.publisher)) {
      stakeBal += storage.mapGet("users", tx.publisher) * 1;
    }

    let max = data['otb_admin'][0] / 100 - stakeBal; 

    if (amt * 1 > max.toFixed(8)){
      throw "You cannot stake more than your max staking power. "
    }


  }


  //Admin pays staking rewards to all stakers.  
  payStakeHolders(){
    this._assertAccountAuth("otb_admin");
    this._checkBeforePayment();

    let amount = blockchain.callWithAuth("token.iost", 'balanceOf', ['contribute', 'otb_admin']);
    let basePercentage = .25;
    let votesMinusBase = JSON.parse(storage.globalMapGet("vote.iost", "v_1", "otb_admin")).votes * 1 - 25000000; 
    let total_rewards = storage.get("totalRewards") * 1;

    if(votesMinusBase > 0){
      basePercentage = votesMinusBase / 400000000 + basePercentage; 
    }
    if(basePercentage.toFixed(4) * 1 > .65){
      basePercentage = .65;
    }
    
    blockchain.callWithAuth("bonus.iost", "exchangeIOST", [tx.publisher, (amount * 1).toFixed(8) ]);
    blockchain.callWithAuth("token.iost", "transfer", ['iost', tx.publisher, 'otbbuyback', (amount * .25).toFixed(8), "Transfer to buy back account. "])
    blockchain.callWithAuth("token.iost", "transfer", ['iost', tx.publisher, blockchain.contractName(), (amount * basePercentage).toFixed(8), "Transfer block reward to contract. "])
    this._updateUserIostClaims((amount * basePercentage).toFixed(8));
    storage.put("totalRewards", (total_rewards + amount * basePercentage).toFixed(8));
  }

  //User can claim their rewards for staking using this function.  
  claimReward(){
    if(storage.mapHas("userClaims", tx.publisher)){
      let claims = storage.mapGet("userClaims", tx.publisher); 

      if(claims * 1 <= 0 ){
        throw "You don't have any claims. "
      }
      else {
        blockchain.callWithAuth("token.iost", "transfer", ["iost", blockchain.contractName(), tx.publisher, claims, "User Receives OTB Staking Rewards. "]);
        storage.mapPut("userClaims", tx.publisher, "0")
      }

      

    }
    else {
      throw "You don't have any claims. "
    }
  }

  _checkBeforePayment(){
    let userKeys = JSON.parse(storage.get("userKeys"));
    let userKeysFiltered = JSON.parse(storage.get("userKeys"));
    let totalStaked = storage.get("totalStakes") * 1; 

    userKeys.forEach(user => {
      
      if(!storage.globalMapHas('vote.iost', 'u_1', user)){
        let userStake = storage.mapGet("users", user);
        this._transferFreezeToken("otbc", blockchain.contractName(), user, userStake, "No longer have votes, so OTBC got unstaked. ")
        userKeysFiltered = userKeysFiltered.filter(u => u !== user);
        storage.mapDel("users", user);
        totalStaked -= userStake * 1; 
      }
      else {
        let data = JSON.parse(storage.globalMapGet('vote.iost', 'u_1', user));
        //check if user unvoted all.  
        if (!data['otb_admin']) {
          let userStake = storage.mapGet("users", user);
          this._transferFreezeToken("otbc", blockchain.contractName(), user, userStake, "No longer have votes, so OTBC got unstaked. ")
          userKeysFiltered = userKeysFiltered.filter(u => u !== user);
          storage.mapDel("users", user);
          totalStaked -= userStake * 1; 
        }
        //user still has votes
        else {
          let votes = data['otb_admin'][0] / 100;
          let userStake = storage.mapGet("users", user) * 1;

          //check if votes is zero. 
          if (votes.toFixed(8) * 1 === 0) {
            this._transferFreezeToken("otbc", blockchain.contractName(), user, userStake.toFixed(8), "No longer have votes, so OTBC got unstaked. ")
            userKeysFiltered = userKeysFiltered.filter(u => u !== user);
            storage.mapDel("users", user);
            totalStaked -= userStake * 1; 
          }

          //check if votes divided by 100 is less then staked otbc
          else if (votes.toFixed(8) * 1 < userStake.toFixed(8) * 1) {
            let overStake = userStake - votes;
            this._transferFreezeToken("otbc", blockchain.contractName(), user, overStake.toFixed(8), "Stakes adjusted due to vote decrease. ");
            storage.mapPut("users", user, votes.toFixed(8));
            totalStaked -= overStake * 1; 
          }
        }
      }

    });
    storage.put("userKeys", JSON.stringify(userKeysFiltered));
    storage.put("totalStakes", totalStaked.toFixed(8));

  }

  //Updates user reward claims for staking.  
  _updateUserIostClaims(amount){
    let userKeys = JSON.parse(storage.get("userKeys"));
    let totalStaked = storage.get("totalStakes") * 1; 

    userKeys.forEach(user => {
      let reward = storage.mapGet("users", user) / totalStaked * amount;
      if (storage.mapHas("userClaims", user)) {
        reward = storage.mapGet("userClaims", user) * 1 + reward;
      }
      storage.mapPut("userClaims", user, reward.toFixed(8));

    })

  }

  //Check to make sure that the account is authorized to perform a function.
  _assertAccountAuth(account) {
    if (!blockchain.requireAuth(account, "active")) {
      throw "Authorization Failure";
    }
  }

  //transfers tokens/iost
  _transferToken(tokenSymbol, from, to, amount, memo) {
    let args = [
      tokenSymbol,
      from,
      to,
      amount,
      memo
    ];
 
    blockchain.callWithAuth("token.iost", "transfer", JSON.stringify(args));

  }

  //transfers tokens/iost with a 3 day freeze. 
  _transferFreezeToken(tokenSymbol, from, to, amount, memo) {
    let args = [
      tokenSymbol,
      from,
      to,
      amount,
      tx.time + 259200000000000,
      memo
    ];
   

    blockchain.callWithAuth("token.iost", "transferFreeze", JSON.stringify(args));

  }

  

}




module.exports = OTBStakes;



