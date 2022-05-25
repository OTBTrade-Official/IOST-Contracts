

const LP_Contract = "Contract7ZkKeDbAnB7ff4X2HZbGPpiCxYUEwFFywgGa9XJJbF4m";
const ROUND_DOWN = 1;


class MintPairToken {
  init() {
    
  }

  can_update(data) {
    return blockchain.requireAuth(blockchain.contractOwner(), 'active');
  }


  updateInit() {
    this._assertAccountAuth(blockchain.contractOwner());

  }

  _quote(amountADesired, reserveA, reserveB) {
    amountADesired = new BigNumber(amountADesired);
    reserveA = new BigNumber(reserveA);
    reserveB = new BigNumber(reserveB);

    if (amountADesired.lt(0) || reserveA.lte(0) || reserveB.lt(0)) {
      throw "OTBTRADE: INVALID_INPUT";
    }

    return amountADesired.times(reserveB).div(reserveA);
  }

  _addLiquidity(
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin
  ) {
    const pair = JSON.parse(blockchain.call(LP_Contract, "getPair", [tokenA, tokenB])[0]);

    if (!pair) {
      throw "no pair";
    }

    let reserveA;
    let reserveB; 
    if (tokenA == pair.token0) {
      reserveA = new BigNumber(pair.reserve0);
      reserveB = new BigNumber(pair.reserve1);
    } else {
      reserveA = new BigNumber(pair.reserve1);
      reserveB = new BigNumber(pair.reserve0);
    }

    if (reserveA.eq(0) || reserveB.eq(0)) {
      return [amountADesired, amountBDesired];
    } else {
      const amountBOptimal = this._quote(amountADesired, reserveA, reserveB);
      if (amountBOptimal.lte(amountBDesired)) {
        if (amountBOptimal.lt(amountBMin)) {
          throw "insufficient b amount";
        }

        return [amountADesired, amountBOptimal];
      } else {
        const amountAOptimal = this._quote(amountBDesired, reserveB, reserveA);

        if (amountAOptimal.gt(amountADesired)) {
          throw "something went wrong";
        }

        if (amountAOptimal.lt(amountAMin)) {
          throw "insufficient a amount";
        }

        return [amountAOptimal, amountBDesired];
      }
    }
  }

  addLiquidity(
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      slippage,
      toAddress
  ) {
    const pair = JSON.parse(blockchain.call(LP_Contract, "getPair", [tokenA, tokenB])[0]);

    if (!pair) {
      throw "OTBTRADE: no pair";
    }

    if(slippage * 0 !== 0 ){
      throw "OTBTRADE: not a real slippage";
    } 

    if(+slippage < 0 || +slippage > .1){
      throw "Slippage cannot be less than zero or greater than 10%"
    }

    const precisionA = tokenA == pair.token0 ? pair.precision0 : pair.precision1;
    const precisionB = tokenA == pair.token0 ? pair.precision1 : pair.precision0;

    let minA = +amountADesired - amountADesired * slippage;
    let minB = +amountBDesired - amountBDesired * slippage;

    amountADesired = new BigNumber(new BigNumber(amountADesired).toFixed(precisionA, ROUND_DOWN));
    amountBDesired = new BigNumber(new BigNumber(amountBDesired).toFixed(precisionB, ROUND_DOWN));
    let amountAMin = new BigNumber(new BigNumber(minA).toFixed(precisionA, ROUND_DOWN));
    let amountBMin = new BigNumber(new BigNumber(minB).toFixed(precisionB, ROUND_DOWN));

    if (amountADesired.lte(0) || amountBDesired.lte(0) || amountAMin.lte(0) || amountBMin.lte(0)) {
      throw "OTBTRADE: INVALID_INPUT";
    }

    const amountArray = this._addLiquidity(
        tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
    const amountA = amountArray[0];
    const amountB = amountArray[1];
    const liquidity = blockchain.call(
        LP_Contract,
        "mint",
        [tokenA, tokenB, amountA.toFixed(precisionA, ROUND_DOWN), amountB.toFixed(precisionB, ROUND_DOWN), toAddress])[0];

    return [amountA.toFixed(precisionA, ROUND_DOWN), amountB.toFixed(precisionB, ROUND_DOWN), liquidity];
  }

  createPairAndAddLiquidity(
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      toAddress
  ) {
    blockchain.call(LP_Contract, "createPair", [tokenA, tokenB]);
    if (new BigNumber(amountADesired).gt(0) && new BigNumber(amountBDesired).gt(0)) {
      return this.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, "0", toAddress);
    } else {
      return [0, 0, 0];
    }
  }

  removeLiquidity(
      tokenA,
      tokenB,
      liquidity,
      amountAMin,
      amountBMin,
      toAddress
  ) {
    const pair = JSON.parse(blockchain.call(LP_Contract, "getPair", [tokenA, tokenB])[0]);
    
    if (!pair) {
      throw "OTBTRADE: no pair";
    }

    const precisionA = tokenA == pair.token0 ? pair.precision0 : pair.precision1;
    const precisionB = tokenA == pair.token0 ? pair.precision1 : pair.precision0;

    liquidity = new BigNumber(liquidity);
    amountAMin = new BigNumber(amountAMin);
    amountBMin = new BigNumber(amountBMin);

    if (liquidity.lte(0) || amountAMin.lte(0) || amountBMin.lte(0)) {
      throw "OTBTRADE: INVALID_INPUT";
    }

    const amountArray = JSON.parse(blockchain.call(
        LP_Contract, "burn", [tokenA, tokenB, liquidity.toString(), JSON.parse(blockchain.contextInfo()).caller.name, toAddress])[0]);
    const amountA = new BigNumber(amountArray[0]);
    const amountB = new BigNumber(amountArray[1]);

    if (amountA.lt(amountAMin)) {
      throw "OTBTRADE: INSUFFICIENT_A_AMOUNT";
    }

    if (amountB.lt(amountBMin)) {
      throw "OTBTRADE: INSUFFICIENT_B_AMOUNT";
    }

    return [amountA.toFixed(precisionA, ROUND_DOWN), amountB.toFixed(precisionB, ROUND_DOWN)];
  }

 

  
}

module.exports = MintPairToken;
