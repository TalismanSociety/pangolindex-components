import { getAddress } from '@ethersproject/address';
import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero } from '@ethersproject/constants';
import { Contract } from '@ethersproject/contracts';
import { JsonRpcSigner, Web3Provider } from '@ethersproject/providers';
import IPangolinRouter from '@pangolindex/exchange-contracts/artifacts/contracts/pangolin-periphery/interfaces/IPangolinRouter.sol/IPangolinRouter.json';
import {
  ALL_CHAINS,
  CAVAX,
  CHAINS,
  Chain,
  ChainId,
  Currency,
  CurrencyAmount,
  JSBI,
  Percent,
  Token,
  Trade,
  currencyEquals,
} from '@pangolindex/sdk';
import { ROUTER_ADDRESS } from '../constants';
import { TokenAddressMap } from '../state/plists/hooks';

// returns the checksummed address if the address is valid, otherwise returns false
export function isAddress(value: any): string | false {
  try {
    return getAddress(value);
  } catch {
    return false;
  }
}

const ETHERSCAN_PREFIXES: { [chainId in ChainId]: string } = {
  43113: CHAINS[ChainId.FUJI].blockExplorerUrls![0],
  43114: CHAINS[ChainId.AVALANCHE].blockExplorerUrls![0],
  11111: CHAINS[ChainId.WAGMI].blockExplorerUrls![0],
  16: CHAINS[ChainId.COSTON].blockExplorerUrls![0],
  329847900: CHAINS[ChainId.NEAR_MAINNET].blockExplorerUrls![0],
  329847901: CHAINS[ChainId.NEAR_TESTNET].blockExplorerUrls![0],
};

const transactionPath = {
  [ChainId.FUJI]: 'tx',
  [ChainId.AVALANCHE]: 'tx',
  [ChainId.WAGMI]: 'tx',
  [ChainId.COSTON]: 'tx',
  [ChainId.NEAR_MAINNET]: 'transactions',
  [ChainId.NEAR_TESTNET]: 'transactions',
};

const addressPath = {
  [ChainId.FUJI]: 'address',
  [ChainId.AVALANCHE]: 'address',
  [ChainId.WAGMI]: 'address',
  [ChainId.COSTON]: 'address',
  [ChainId.NEAR_MAINNET]: 'accounts',
  [ChainId.NEAR_TESTNET]: 'accounts',
};

const blockPath = {
  [ChainId.FUJI]: 'block',
  [ChainId.AVALANCHE]: 'block',
  [ChainId.WAGMI]: 'block',
  [ChainId.COSTON]: 'block',
  [ChainId.NEAR_MAINNET]: 'blocks',
  [ChainId.NEAR_TESTNET]: 'blocks',
};

const tokenPath = {
  [ChainId.FUJI]: 'token',
  [ChainId.AVALANCHE]: 'token',
  [ChainId.WAGMI]: 'token',
  [ChainId.COSTON]: 'token',
  [ChainId.NEAR_MAINNET]: 'accounts',
  [ChainId.NEAR_TESTNET]: 'accounts',
};

export function getEtherscanLink(
  chainId: ChainId,
  data: string,
  type: 'transaction' | 'token' | 'address' | 'block',
): string {
  const prefix = `${ETHERSCAN_PREFIXES[chainId] || ETHERSCAN_PREFIXES[43114]}`;

  switch (type) {
    case 'transaction': {
      return `${prefix}/${transactionPath[chainId]}/${data}`;
    }
    case 'token': {
      return `${prefix}/${tokenPath[chainId]}/${data}`;
    }
    case 'block': {
      return `${prefix}/${blockPath[chainId]}/${data}`;
    }
    case 'address':
    default: {
      return `${prefix}/${addressPath[chainId]}/${data}`;
    }
  }
}

// shorten the checksummed version of the input address to have 0x + 4 characters at start and end
export function shortenAddress(address: string, chainId: ChainId = ChainId.AVALANCHE, chars = 4): string {
  const parsed = CHAINS[chainId]?.evm ? isAddress(address) : address;
  if (!parsed) {
    throw Error(`Invalid 'address' parameter '${address}'.`);
  }
  return `${parsed.substring(0, chars)}...${parsed.substring(parsed.length - chars)}`;
}

// add 10%
export function calculateGasMargin(value: BigNumber): BigNumber {
  return value.mul(BigNumber.from(10000).add(BigNumber.from(1000))).div(BigNumber.from(10000));
}

// converts a basis points value to a sdk percent
export function basisPointsToPercent(num: number): Percent {
  return new Percent(JSBI.BigInt(num), JSBI.BigInt(10000));
}

// account is not optional
export function getSigner(library: Web3Provider, account: string): JsonRpcSigner {
  return library.getSigner(account).connectUnchecked();
}

// account is optional
export function getProviderOrSigner(library: Web3Provider, account?: string): Web3Provider | JsonRpcSigner {
  return account ? getSigner(library, account) : library;
}

// account is optional
export function getContract(address: string, ABI: any, library: Web3Provider, account?: string): Contract {
  if (!isAddress(address) || address === AddressZero) {
    throw Error(`Invalid 'address' parameter '${address}'.`);
  }

  return new Contract(address, ABI, getProviderOrSigner(library, account) as any);
}

// account is optional
export function getRouterContract(chainId: ChainId, library: Web3Provider, account?: string): Contract {
  return getContract(
    chainId ? ROUTER_ADDRESS[chainId] : ROUTER_ADDRESS[ChainId.AVALANCHE],
    IPangolinRouter.abi,
    library,
    account,
  );
}

export function isTokenOnList(defaultTokens: TokenAddressMap, chainId: ChainId, currency?: Currency): boolean {
  if (chainId && currency === CAVAX[chainId]) return true;
  return Boolean(currency instanceof Token && defaultTokens[currency.chainId]?.[currency.address]);
}

/**
 * Returns true if the trade requires a confirmation of details before we can submit it
 * @param tradeA trade A
 * @param tradeB trade B
 */
export function tradeMeaningfullyDiffers(tradeA: Trade, tradeB: Trade): boolean {
  return (
    tradeA.tradeType !== tradeB.tradeType ||
    !currencyEquals(tradeA.inputAmount.currency, tradeB.inputAmount.currency) ||
    !tradeA.inputAmount.equalTo(tradeB.inputAmount) ||
    !currencyEquals(tradeA.outputAmount.currency, tradeB.outputAmount.currency) ||
    !tradeA.outputAmount.equalTo(tradeB.outputAmount)
  );
}

export function getChainByNumber(chainId: ChainId | number): Chain | undefined {
  return ALL_CHAINS.find((chain) => chain.chain_id === chainId);
}

export function calculateSlippageAmount(value: CurrencyAmount, slippage: number): [JSBI, JSBI] {
  if (slippage < 0 || slippage > 10000) {
    throw Error(`Unexpected slippage value: ${slippage}`);
  }
  return [
    JSBI.divide(JSBI.multiply(value.raw, JSBI.BigInt(10000 - slippage)), JSBI.BigInt(10000)),
    JSBI.divide(JSBI.multiply(value.raw, JSBI.BigInt(10000 + slippage)), JSBI.BigInt(10000)),
  ];
}
