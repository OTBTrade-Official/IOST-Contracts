
const admin = "otb_admin";
const providerFee = 0.05;



// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class TixLiquidityContract {
    init() {
        storage.put("pair", "iostANDtix");
        storage.put("userKey", JSON.stringify([]));
        storage.put("admins", JSON.stringify(["otb_admin"]));
    }

    //Only owner can update.
    can_update(data) {
        return blockchain.requireAuth(admin, "active");
    }

    //Used to update errors when needed. 
    updateInit() {
        this._assertAccountAuth(admin);

    }


    _fixedNum(num) {
        return (num * 1).toFixed(8);
    }
     

    //Requires admin to list the pair and set initial swap value.  
    initiatePair(symbol1Amount, symbol2Amount) {
        //checks that admin is calling function. 
        this._checkAdmin(tx.publisher);
        let pair = storage.get("pair").split("AND");
        let s1 = pair[0]
        let s2 = pair[1];

        let s1Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s1, blockchain.contractName()]) * 1;
        let s2Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s2, blockchain.contractName()]) * 1;

        if (s1Amount.toFixed(8) * s2Amount.toFixed(8) !== 0) {
            throw "Has already been initiated. "
        }


        let data = {};
        data[s1] = 1;
        data[s2] = 1;

        storage.put("userKey", JSON.stringify([tx.publisher]));
        storage.mapPut("users", tx.publisher, JSON.stringify(data));


        this._transferToken(s1, tx.publisher, blockchain.contractName(), this._fixedNum(symbol1Amount), 'Admin sends ' + s1 + ' to Liquidity Pool. ');
        this._transferToken(s2, tx.publisher, blockchain.contractName(), this._fixedNum(symbol2Amount), 'Admin sends ' + s2 + ' to Liquidity Pool. ');
    }

    fillOrderBook() {
        this._assertAccountAuth(admin);
        let pair = storage.get("pair").split("AND");
        let symbol = pair[1];

        this._cancelOrderBook(symbol);
        this._fillBuyOrders();
        this._fillSellOrders();
    }

    _fillSellOrders() {
        let pair = storage.get("pair").split("AND");
        let s1 = pair[0];
        let s2 = pair[1];

        let s1Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s1, blockchain.contractName()]) * 1;
        let s2Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s2, blockchain.contractName()]) * 1;
        let invariant = s1Amount * s2Amount;

        let sellEntries = this._fixedNum(s2Amount * .01);

        for (var i = 0; i < 9; i++) {
            let providerGains = sellEntries * providerFee;

            let symbol1Pool = s2Amount * 1 - sellEntries * 1;
            let symbol2Pool = invariant / symbol1Pool;
            let userReceives = symbol2Pool * 1 - s1Amount * 1;
            let price = userReceives / sellEntries;

            let args = [
                s2,
                this._fixedNum(price),
                this._fixedNum(sellEntries),
                false,
                blockchain.contractName()
            ];

            blockchain.callWithAuth("ContractB8gH3sMXFG5Jk32j1ZkbCmUmtTknHeThpvSTFfhSZPZh", "liquidityOrder", JSON.stringify(args));

            symbol1Pool -= providerGains * 1;
            invariant = symbol1Pool * symbol2Pool;
            s1Amount = symbol2Pool;
            s2Amount = symbol1Pool;
        }



    }

    _fillBuyOrders() {

        let pair = storage.get("pair").split("AND");
        let s1 = pair[0];
        let s2 = pair[1];

        let s1Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s1, blockchain.contractName()]) * 1;
        let s2Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s2, blockchain.contractName()]) * 1;
        let invariant = s1Amount * s2Amount;

        let buyEntries = this._fixedNum(s1Amount * .01);

        for (var i = 0; i < 9; i++) {
            let providerGains = buyEntries * providerFee;

            let symbol1Pool = s1Amount * 1 - buyEntries * 1;
            let symbol2Pool = invariant / symbol1Pool;
            let userReceives = symbol2Pool * 1 - s2Amount * 1;
            let price = buyEntries / userReceives;


            let args = [
                s2,
                this._fixedNum(price),
                this._fixedNum(buyEntries / price),
                true,
                blockchain.contractName()
            ];

            blockchain.callWithAuth("ContractB8gH3sMXFG5Jk32j1ZkbCmUmtTknHeThpvSTFfhSZPZh", "liquidityOrder", JSON.stringify(args));

            symbol1Pool -= providerGains * 1;
            invariant = symbol1Pool * symbol2Pool;
            s1Amount = symbol1Pool;
            s2Amount = symbol2Pool;
        } 



    }



    //Users can add to liquidity pool.  
    addLiquidity(symbol1Amount) {
        if (symbol1Amount * 0 !== 0) {
            throw "Must be a valid numerical amount. "
        }

        if (symbol1Amount * 1 <= 0) {
            throw "Must be an amount that is greater than zero. "
        }

        let pair = storage.get("pair").split("AND");
        let s1 = pair[0]
        let s2 = pair[1];

        let s1Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s1, blockchain.contractName()]) * 1;
        let s2Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s2, blockchain.contractName()]) * 1; 

        if (s1Amount === 0 || s2Amount === 0) {
            throw "Pair has not been setup yet. "
        }

        let symbol2Amount = symbol1Amount * s2Amount / s1Amount;

        let users = JSON.parse(storage.get("userKey"));
        this._updateUserPercentage(users, tx.publisher, s1, s2, symbol1Amount * 1, symbol2Amount, true); 

        if (!storage.mapHas("users", tx.publisher)) {
            
            users.push(tx.publisher);
            let data = {};
            data[s1] = symbol2Amount / (s2Amount + symbol2Amount);
            data[s2] = symbol2Amount / (s2Amount + symbol2Amount);
            storage.mapPut("users", tx.publisher, JSON.stringify(data));
            storage.put("userKey", JSON.stringify(users));
        }
        else {
            let data = JSON.parse(storage.mapGet("users", tx.publisher));
            data[s1] = (data[s2] * s2Amount + symbol2Amount * 1) / (s2Amount + symbol2Amount);
            data[s2] = (data[s2] * s2Amount + symbol2Amount * 1) / (s2Amount + symbol2Amount);
            storage.mapPut("users", tx.publisher, JSON.stringify(data));
        }

        

        //all logic succeeded, so user sends the amounts to the contract.  
        this._transferToken(s1, tx.publisher, blockchain.contractName(), this._fixedNum(symbol1Amount), 'User adds to liquidity pool. ');
        this._transferToken(s2, tx.publisher, blockchain.contractName(), this._fixedNum(symbol2Amount), 'User adds to liquidity pool. ');

    }

    _cancelOrderBook(symbol) {
        blockchain.callWithAuth("ContractB8gH3sMXFG5Jk32j1ZkbCmUmtTknHeThpvSTFfhSZPZh", "cancelLiquidity", JSON.stringify([blockchain.contractName(), symbol]));
    }

    _updateUserPercentage(users, currentUser, symbol1, symbol2, amount1, amount2, isAdd) {

        let s1Amount = blockchain.callWithAuth("token.iost", "balanceOf", [symbol1, blockchain.contractName()]) * 1;
        let s2Amount = blockchain.callWithAuth("token.iost", "balanceOf", [symbol2, blockchain.contractName()]) * 1; 

        users.forEach(user => {
            if (user !== currentUser) {
                let data = JSON.parse(storage.mapGet("users", user));
                if (isAdd) {
                    data[symbol1] = (data[symbol1] * s1Amount) / (s1Amount + amount1);
                    data[symbol2] = (data[symbol2] * s2Amount) / (s2Amount + amount2);
                }
                else {
                    data[symbol1] = (data[symbol1] * s1Amount) / (s1Amount - amount1);
                    data[symbol2] = (data[symbol2] * s2Amount) / (s2Amount - amount2);
                }
            
                storage.mapPut("users", user, JSON.stringify(data));
            }
            
        })
    }

    //Liquidity providers can withdraw from liquidity pool.  
    withdrawLiquidity() {
        let pair = storage.get("pair").split("AND");
        let s1 = pair[0]
        let s2 = pair[1];

        this._cancelOrderBook(s2);

        let s1Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s1, blockchain.contractName()]) * 1; 
        let s2Amount = blockchain.callWithAuth("token.iost", "balanceOf", [s2, blockchain.contractName()]) * 1; 

        if (s1Amount === 0 || s2Amount === 0) {
            throw "Pair has not been setup yet. "
        }

        if (!storage.mapHas("users", tx.publisher)) {
            throw "You don't have liquidity in this pool. ";
        }

        
        
        let userData = JSON.parse(storage.mapGet("users", tx.publisher));

        if (userData[s1] > 1) {
            userData[s1] = 1
        }

        if (userData[s2] > 1) {
            userData[s2] = 1
        }

        let s1UserAmount = userData[s1] * s1Amount;
        let s2UserAmount = userData[s2] * s2Amount;

        let users = JSON.parse(storage.get("userKey"));
        users = users.filter(u => u !== tx.publisher);
        storage.put("userKey", JSON.stringify(users));
        storage.mapDel("users", tx.publisher);

        this._updateUserPercentage(users, tx.publisher, s1, s2, s1UserAmount * 1, s2UserAmount, false); 

        this._transferToken(s1, blockchain.contractName(), tx.publisher, this._fixedNum(s1UserAmount), 'User withdraws from liquidity pool. ');
        this._transferToken(s2, blockchain.contractName(), tx.publisher, this._fixedNum(s2UserAmount), 'User withdraws from liquidity pool. ');


        
    }



    //Check to make sure that the account is authorized to perform a function.
    _assertAccountAuth(account) {
        if (!blockchain.requireAuth(account, "active")) {
            throw "Authorization Failure";
        }
    }

    _checkAdmin(account){
        let admins = JSON.parse(storage.get("admins")); 
        if(!admins.includes(account)){
            throw "Authorization Failure";
        }
    }

    addAdmins(newAdmin){
        this._assertAccountAuth(admin)
        let admins = JSON.parse(storage.get("admins")); 
        admins.push(newAdmin);
        storage.put("admins", JSON.stringify(admins));
    }

    transferFrom(tcontract, tokenSymbol, to, amount, memo) {
        this._assertAccountAuth(admin); 
        if (!blockchain.requireAuth("ContractB8gH3sMXFG5Jk32j1ZkbCmUmtTknHeThpvSTFfhSZPZh", "active")) {
            throw "Contract is not authorized to use this function. "
        }

        let args = [
            tokenSymbol,
            blockchain.contractName(),
            to,
            amount,
            memo
        ];

        blockchain.callWithAuth(tcontract, "transfer", JSON.stringify(args));
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





}

module.exports = TixLiquidityContract;
