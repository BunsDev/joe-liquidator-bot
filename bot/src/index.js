const fetch = require('isomorphic-unfetch');
const { createClient, gql } = require('@urql/core');

// From https://thegraph.com/hosted-service/subgraph/traderjoe-xyz/lending?query=underwater%20accounts
const TRADER_JOE_LENDING_GRAPH_URL = 'https://api.thegraph.com/subgraphs/name/traderjoe-xyz/lending';
const UNDERWATER_ACCOUNTS_QUERY = gql`
  query {
    accounts(where: {health_gt: 0, health_lt: 1, totalBorrowValueInUSD_gt: 0}) {
      id
      health
      totalBorrowValueInUSD
      totalCollateralValueInUSD
      tokens {
        id
        symbol
        market {
          name
          symbol
          collateralFactor
          underlyingPriceUSD
          exchangeRate
          reserveFactor
          underlyingDecimals
        }
        borrowBalanceUnderlying
        supplyBalanceUnderlying
        enteredMarket
      }
    }
  }
`

const client = createClient({
  url: TRADER_JOE_LENDING_GRAPH_URL,
});

const getBorrowValueInUSD = (token) => {
  const { borrowBalanceUnderlying: borrowBalanceUnderlyingStr, market } = token;
  const { underlyingPriceUSD: underlyingPriceUSDStr } = market;
  return parseFloat(borrowBalanceUnderlyingStr) * parseFloat(underlyingPriceUSDStr);
}

const getSupplyValueInUSD = (token) => {
  const { supplyBalanceUnderlying: supplyBalanceUnderlyingStr, market } = token;
  const { underlyingPriceUSD: underlyingPriceUSDStr } = market;
  return parseFloat(supplyBalanceUnderlyingStr) * parseFloat(underlyingPriceUSDStr);
}

const findBorrowPositionToRepay = (tokens) => {
  for (token of tokens) {
    const borrowValue = getBorrowValueInUSD(token);
    if (borrowValue > 0) {
      return token;
    }
  }
}

const findSupplyPositionToSeize = (tokens, borrowPositionToRepay) => {
  const borrowValue = getBorrowValueInUSD(borrowPositionToRepay);
  for (token of tokens) {
    const { enteredMarket } = token;

    // Need to have `enteredMarket` to have been posted as collateral
    if (!enteredMarket) {
      continue;
    }

    const supplyValue = getSupplyValueInUSD(token);
    // Must have enough supply to seize 50% of borrow value
    if (supplyValue >= borrowValue * 0.5) {
      return token;
    }
  }
}

client.query(UNDERWATER_ACCOUNTS_QUERY)
  .toPromise()
  .then((result) => {
    const { data: { accounts } } = result;
    const account = accounts[0];
    // Approximately:
    // totalBorrowValueInUSD = sum(borrowBalanceUnderlying * underlyingPriceUSD)
    // totalCollateralValueInUSD = sum(supplyBalanceUnderlying * underlyingPriceUSD * collateralFactor)
    const { totalBorrowValueInUSD, totalCollateralValueInUSD, tokens } = account;
    console.log("totalBorrowValueInUSD:", totalBorrowValueInUSD);
    console.log("totalCollateralValueInUSD:", totalCollateralValueInUSD);
    console.log("TOKENS:", tokens);
    const borrowPositionToRepay = findBorrowPositionToRepay(tokens);
    const supplyPositionToSeize = findSupplyPositionToSeize(tokens, borrowPositionToRepay)
    console.log("BORROW POSITION TO REPAY:", borrowPositionToRepay);
    console.log("SUPPLY POSITION TO SEIZE:", supplyPositionToSeize);
  })
  .catch((err) => {
    console.log('Error fetching subgraph data: ', err);
  })