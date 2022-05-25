
const admin = "opasheck";
const providerFee = 0.006;



// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class ArbContract {
    init() {
        storage.put("admins", JSON.stringify(["otb_admin", "opasheck", "mr5mith", "otbgroup"]));
    }

    //Only owner can update.
    can_update(data) {
        return blockchain.requireAuth(admin, "active");
    }

    //Used to update errors when needed. 
    updateInit() {
        this._assertAccountAuth(admin);

        

    }

  


    //Check to make sure that the account is authorized to perform a function.
    _assertAccountAuth(account) {
        if (!blockchain.requireAuth(account, "active")) {
            throw "Authorization Failure";
        }
    }

    _checkAdmin(account) {
        let admins = JSON.parse(storage.get("admins"));
        if (!admins.includes(account)) {
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





}

module.exports = ArbContract;
