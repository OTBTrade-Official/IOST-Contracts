
const cadmin = "otb_admin";



// This is the root of the smart contract.  This will initialize the smart contract on the blockchain.
class ExchangeManagement {
    init() {
        storage.put("lotteryID", "0");
        storage.mapPut("lotteryTickets", "0", JSON.stringify([]));
        

    }

    //Only owner can update.
    can_update(data) {
        return blockchain.requireAuth(blockchain.contractOwner(), "active");
    }

    updateInit() {
        this._assertAccountAuth(cadmin);

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

        let reward = ((lotteryBalance / numWinners) - .000000005).toFixed(8);
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

    //Adds ticket to the lottery system. 
    addTicket(account) {
        this._assertAccountAuth(cadmin);
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

    addLiquidityPairs(contract, symbol1, symbol2) {
        this._assertAccountAuth(cadmin);
        let pairs = JSON.parse(storage.get("liquidityPairKeys"));

        if (pairs.includes(contract)) {
            throw "This contract already exists. "
        }

        pairs.push(contract);

        storage.put("liquidityPairKeys", JSON.stringify(pairs));
        storage.mapPut("liquidityPair", contract, symbol1 + "AND" + symbol2);
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

        let pairs = JSON.parse(storage.get("liquidityPairKeys"));

        let finalResult = tickets.filter(a => a !== "otbbuyback" && a !== "otb_admin" && !pairs.includes(a));

        return finalResult;
    }

    //Use with filter to find unique strings.  
    _distinct(v, i, s) {
        return s.indexOf(v) === i;
    }

    ///////////////////////////
    // Referral LOGIC //
    ///////////////////////////
    //Check to see if the referee is an exclusive referree member.
    //Checks to see if user has already been referred by another exclusive member.
    checkReferral(referee, account) {
        let exclusiveReferrals = JSON.parse(storage.globalGet("ContractB8gH3sMXFG5Jk32j1ZkbCmUmtTknHeThpvSTFfhSZPZh", "exclusiveReferrals"));

        //check if user has existing ref already.  
        //if not then store the ref if it's an exclusive
        //if yes then store. 
        if (!storage.globalMapHas("ContractB8gH3sMXFG5Jk32j1ZkbCmUmtTknHeThpvSTFfhSZPZh", "account", account)) {
            if (!exclusiveReferrals.includes(referee)) {
                return null
            }
            return { lottery: 0, referredBy: referee } 
        }

        let reference = JSON.parse(storage.globalMapGet("ContractB8gH3sMXFG5Jk32j1ZkbCmUmtTknHeThpvSTFfhSZPZh", "account", account));

        if (reference.referredBy === null || reference.referredBy === "null") {
            if (!exclusiveReferrals.includes(referee)) {
                return null
            }

            reference.referredBy = referee;
            return reference
        } 


        return reference
        
        
    }



    

    //Check to make sure that the account is authorized to perform a function.
    _assertAccountAuth(account) {
        if (!blockchain.requireAuth(account, "active")) {
            throw "Authorization Failure";
        }
    }



    updateErrors() {
        this._assertAccountAuth(cadmin);
       

    }

}

module.exports = ExchangeManagement;
