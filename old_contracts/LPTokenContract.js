const CHUNK_SIZE = 500;
const UNIVERSAL_PRECISION = 8;
const MINIMUM_LIQUIDITY = 0.00001;
const UNIT_LIQUIDITY = 1e-8;
const ROUND_DOWN = 1;
const TIME_LOCK_DURATION = 12  *  3600;

class LPTokenContract {
    init() {
    }

    can_update(data) {
        return blockchain.requireAuth(blockchain.contractOwner(), 'active') && !this.isLocked();
    }

    _requireOwner() {
        if (!blockchain.requireAuth(blockchain.contractOwner(), 'active')) {
            throw 'require auth error:not contractOwner';
        }
    }

    isLocked() {
        const now = Math.floor(tx.time  /  1000000000);
        const status = +this._g('timeLockStatus') || 0;
        const until = +this._g('timeLockUntil') || 0;
        return status  ==  1 || now  <  until;
    }

    startTimeLock() {
        this._requireOwner();
        this._p('timeLockStatus', '1');
    }

    stopTimeLock() {
        this._requireOwner();
        const now = Math.floor(tx.time  /  1000000000);
        this._p('timeLockUntil', (now  +  TIME_LOCK_DURATION).toString());
        this._p('timeLockStatus', '0');
    }

    setFeeTo(feeTo) {
        this._requireOwner();
        this._p('feeTo', feeTo);
    }

    _p(k, v){
        storage.put(k, v); 
    }

    _g(k){
        return storage.get(k);
    }

    _mP(k, f, v){
        storage.mapPut(k, f, v); 
    }

    _mG(k, f){
        return storage.mapGet(k, f); 
    }

    _getFeeTo() {
        return this._g('feeTo') || '';
    }

    setListingFee(fee) {
        this._requireOwner();
        this._p('listingFee', fee.toString());
    }

    _getListingFee() {
        return this._g('listingFee');
    }

    _setPair(pairName, pair) {
        this._mP('pair', pairName, JSON.stringify(pair));
    }

    _setPairObj(pair) {
        const pairName = pair.token0  +  '/'  +  pair.token1;
        this._setPair(pairName, pair);
    }

    _getPair(pairName) {
        return JSON.parse(this._mG('pair', pairName) || 'null');
    }

    _hasPair(pairName) {
        return storage.mapHas('pair', pairName);
    }

    _insertToAllPairs(pairName) {
        let index = 0;
        while (storage.mapHas('allPairs', index.toString())) {
            ++index;
        }
        if (index  -  1  >=  0) {
            const array = JSON.parse(this._mG('allPairs', (index  -  1).toString()));
            if (array.length  <  CHUNK_SIZE) {
                array.push(pairName);
                this._mP('allPairs', (index  -  1).toString(), JSON.stringify(array));
                return;
            }
        }
        this._mP('allPairs', index.toString(), JSON.stringify([pairName]));
    }

    _getPairName(token0, token1) {
        if (token0  <  token1) {
            return token0  +  '/'  +  token1;
        } else {
            return token1  +  '/'  +  token0;
        }
    }

    getPair(token0, token1) {
        const pairName = this._getPairName(token0, token1);
        return this._getPair(pairName);
    }

    _plusTokenBalance(token, delta, precision) {
        var balance = new BigNumber(this._mG('tokenBalance', token) || '0');
        balance = balance.plus(delta);
        this._mP('tokenBalance', token, balance.toFixed(precision, ROUND_DOWN));
    }

    _minusTokenBalance(token, delta, precision) {
        var balance = new BigNumber(this._mG('tokenBalance', token) || '0');
        balance = balance.minus(delta);
        this._mP('tokenBalance', token, balance.toFixed(precision, ROUND_DOWN));
    }

    _setTokenBalance(token, balance, precision) {
        this._mP('tokenBalance', token, balance.toFixed(precision, ROUND_DOWN));
    }

    _getTokenBalance(token) {
        return new BigNumber(this._mG('tokenBalance', token));
    }

    allPairs() {
        let index = 0;
        let res = [];
        while (storage.mapHas('allPairs', index.toString())) {
            res = res.concat(JSON.parse(this._mG('allPairs', index.toString())));
            ++index;
        }
        return res;
    }

    createPair(token0, token1) {
        if (token0  >  token1) {
            let temp = token0;
            token0 = token1;
            token1 = temp;
        }
        const pairName = this._getPairName(token0, token1);
        if (this._hasPair(pairName)) {
            throw 'pair exists';
        }
        const totalSupply0 = +blockchain.call('token.iost', 'totalSupply', [token0])[0];
        const totalSupply1 = +blockchain.call('token.iost', 'totalSupply', [token1])[0];
        if (!totalSupply0 || !totalSupply1) {
            throw 'invalid token';
        }
        const now = Math.floor(tx.time  /  1000000000);
        if (this._getFeeTo()) {
            blockchain.transfer(tx.publisher, this._getFeeTo(), this._getListingFee(), 'listing fee');
        }
        const lpSymbol = 'otblp_' + tx.hash.toLowerCase().substring(0, 10);
        this._mP('pair', pairName, JSON.stringify({
            createdTime: now,
            token0: token0,
            token1: token1,
            precision0: this._checkPrecision(token0),
            precision1: this._checkPrecision(token1),
            reserve0: '0',
            reserve1: '0',
            blockTimestampLast: 0,
            price0CumulativeLast: '0',
            price1CumulativeLast: '0',
            kLast: '0',
            lp: lpSymbol,
            lpSupply: '0'
        }));
        this._insertToAllPairs(pairName);
        const config = {
            'decimal': UNIVERSAL_PRECISION,
            'canTransfer': true,
            'fullName': 'OTB LP Token: '  +  token0  +  ' / '  +  token1
        };
        blockchain.callWithAuth('token.iost', 'create', [
            lpSymbol,
            blockchain.contractName(),
            10000000000,
            config
        ]);
    }

    _update(pair, balance0, balance1) {
        const now = Math.floor(tx.time  /  1000000000);
        if (now  <  pair.blockTimestampLast) {
            throw 'block time error';
        }
        const timeElapsed = now  -  pair.blockTimestampLast;
        if (timeElapsed  >  0 && pair.reserve0  >  0 && pair.reserve1  >  0) {
            pair.price0CumulativeLast = new BigNumber(pair.price0CumulativeLast).plus(new BigNumber(pair.reserve1).div(pair.reserve0).times(timeElapsed)).toFixed(UNIVERSAL_PRECISION, ROUND_DOWN);
            pair.price1CumulativeLast = new BigNumber(pair.price1CumulativeLast).plus(new BigNumber(pair.reserve0).div(pair.reserve1).times(timeElapsed)).toFixed(UNIVERSAL_PRECISION, ROUND_DOWN);
        }
        pair.reserve0 = balance0.toFixed(pair.precision0, ROUND_DOWN);
        pair.reserve1 = balance1.toFixed(pair.precision1, ROUND_DOWN);
        pair.blockTimestampLast = now;
        blockchain.receipt(JSON.stringify([
            'sync',
            pair.reserve0,
            pair.reserve1
        ]));
    }

    _mintFee(pair) {
        const feeTo = this._getFeeTo();
        const feeOn = feeTo  !=  '';
        const _kLast = new BigNumber(pair.kLast);
        if (feeOn) {
            if (!_kLast.eq(0)) {
                const rootK = new BigNumber(pair.reserve0).times(pair.reserve1).sqrt();
                const rootKLast = _kLast.sqrt();
                if (rootK.gt(rootKLast)) {
                    const totalSupply = new BigNumber(blockchain.call('token.iost', 'supply', [pair.lp])[0]);
                    const numerator = rootK.minus(rootKLast).times(totalSupply);
                    const denominator = rootK.times(5).plus(rootKLast);
                    const liquidity = numerator.div(denominator);
                    const liquidityStr = liquidity.toFixed(UNIVERSAL_PRECISION, ROUND_DOWN);
                    if (new BigNumber(liquidityStr).gt(0)) {
                        this._mint(pair.lp, feeTo, liquidity);
                    }
                }
            }
        } else {if (!_kLast.eq(0)) {
            pair.kLast = '0';
        }}
        return feeOn;
    }

    _mint(lpSymbol, toAddress, amount) {
        blockchain.callWithAuth('token.iost', 'issue', [
            lpSymbol,
            toAddress,
            amount.toFixed(UNIVERSAL_PRECISION, ROUND_DOWN)
        ]);
    }

    _burn(lpSymbol, fromAddress, amount) {
        blockchain.callWithAuth('token.iost', 'destroy', [
            lpSymbol,
            fromAddress,
            amount.toFixed(UNIVERSAL_PRECISION, ROUND_DOWN)
        ]);
    }

    _checkPrecision(symbol) {
        return +storage.globalMapGet('token.iost', 'TI'  +  symbol, 'decimal') || 0;
    }

    mint(tokenA, tokenB, amountA, amountB, toAddress) {
        const pair = this.getPair(tokenA, tokenB);
        if (!pair) {
            throw 'OTB: no pair';
        }
        const amount0 = new BigNumber((pair.token0  ==  tokenA) ? (amountA) : (amountB));
        const amount1 = new BigNumber((pair.token1  ==  tokenB) ? (amountB) : (amountA));
        if (amount0.lte(0) || amount1.lte(0)) {
            throw 'OTB: INVALID_INPUT';
        }
        blockchain.callWithAuth('token.iost', 'transfer', [
            pair.token0,
            tx.publisher,
            blockchain.contractName(),
            amount0.toFixed(pair.precision0, ROUND_DOWN),
            'mint lp'
        ]);
        this._plusTokenBalance(pair.token0, amount0, pair.precision0);
        blockchain.callWithAuth('token.iost', 'transfer', [
            pair.token1,
            tx.publisher,
            blockchain.contractName(),
            amount1.toFixed(pair.precision1, ROUND_DOWN),
            'mint lp'
        ]);
        this._plusTokenBalance(pair.token1, amount1, pair.precision1);
        const feeOn = this._mintFee(pair);
        const _totalSupply = new BigNumber(blockchain.call('token.iost', 'supply', [pair.lp])[0]);
        let liquidity;
        if (_totalSupply.eq(0)) {
            liquidity = amount0.times(amount1).sqrt().minus(MINIMUM_LIQUIDITY);
            this._mint(pair.lp, blockchain.contractName(), MINIMUM_LIQUIDITY);
        } else {
            liquidity = BigNumber.min(amount0.times(_totalSupply).div(pair.reserve0), amount1.times(_totalSupply).div(pair.reserve1));
        }
        const balance0 = amount0.plus(pair.reserve0);
        const balance1 = amount1.plus(pair.reserve1);
        if (liquidity.lt(UNIT_LIQUIDITY)) {
            throw 'OTB: INSUFFICIENT_LIQUIDITY_MINTED';
        }
        this._mint(pair.lp, toAddress, liquidity);
        this._update(pair, balance0, balance1);
        if (feeOn) {
            pair.kLast = new BigNumber(pair.reserve0).times(pair.reserve1).toFixed(pair.precision0  +  pair.precision1, ROUND_DOWN);
        }
        pair.lpSupply = blockchain.call('token.iost', 'supply', [pair.lp])[0];
        this._setPairObj(pair);
        return liquidity;
    }

    burn(tokenA, tokenB, liquidity, fromAddress, toAddress) {
        liquidity = new BigNumber(liquidity);
        if (liquidity.lt(UNIT_LIQUIDITY)) {
            throw 'OTB: INVALID_INPUT';
        }
        const pair = this.getPair(tokenA, tokenB);
        if (!pair) {
            throw 'OTB: no pair';
        }
        const feeOn = this._mintFee(pair);
        const _totalSupply = blockchain.call('token.iost', 'supply', [pair.lp])[0];
        const amount0 = liquidity.times(pair.reserve0).div(_totalSupply);
        const amount1 = liquidity.times(pair.reserve1).div(_totalSupply);
        if (amount0.lte(0) || amount1.lte(0)) {
            throw 'OTB: INSUFFICIENT_LIQUIDITY_BURNED';
        }
        this._burn(pair.lp, fromAddress, liquidity);
        blockchain.callWithAuth('token.iost', 'transfer', [
            pair.token0,
            blockchain.contractName(),
            toAddress,
            amount0.toFixed(pair.precision0, ROUND_DOWN),
            'burn lp token'
        ]);
        this._minusTokenBalance(pair.token0, amount0, pair.precision0);
        blockchain.callWithAuth('token.iost', 'transfer', [
            pair.token1,
            blockchain.contractName(),
            toAddress,
            amount1.toFixed(pair.precision1, ROUND_DOWN),
            'burn lp token'
        ]);
        this._minusTokenBalance(pair.token1, amount1, pair.precision1);
        const balance0 = new BigNumber(pair.reserve0).minus(amount0);
        const balance1 = new BigNumber(pair.reserve1).minus(amount1);
        this._update(pair, balance0, balance1);
        if (feeOn) {
            pair.kLast = new BigNumber(pair.reserve0).times(pair.reserve1).toFixed(pair.precision0  +  pair.precision1, ROUND_DOWN);
        }
        pair.lpSupply = blockchain.call('token.iost', 'supply', [pair.lp])[0];
        this._setPairObj(pair);
        if (tokenA  ==  pair.token0) {
            return [
                amount0.toFixed(pair.precision0, ROUND_DOWN),
                amount1.toFixed(pair.precision1, ROUND_DOWN)
            ];
        } else {
            return [
                amount1.toFixed(pair.precision1, ROUND_DOWN),
                amount0.toFixed(pair.precision0, ROUND_DOWN)
            ];
        }
    }

    
    

    
}
module.exports = LPTokenContract;