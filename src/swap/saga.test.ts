import { PayloadAction } from '@reduxjs/toolkit'
import BigNumber from 'bignumber.js'
import { expectSaga } from 'redux-saga-test-plan'
import { EffectProviders, StaticProvider } from 'redux-saga-test-plan/providers'
import { call, select } from 'redux-saga/effects'
import { SwapEvents } from 'src/analytics/Events'
import ValoraAnalytics from 'src/analytics/ValoraAnalytics'
import { swapSubmitSaga } from 'src/swap/saga'
import { swapApprove, swapError, swapExecute, swapPriceChange } from 'src/swap/slice'
import { Field, SwapInfo, SwapTransaction } from 'src/swap/types'
import { getERC20TokenContract } from 'src/tokens/saga'
import { Actions } from 'src/transactions/actions'
import { sendTransaction } from 'src/transactions/send'
import { TokenTransactionTypeV2 } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { getContractKit } from 'src/web3/contracts'
import { getConnectedUnlockedAccount } from 'src/web3/saga'
import { walletAddressSelector } from 'src/web3/selectors'
import { createMockStore } from 'test/utils'
import {
  mockAccount,
  mockCeloAddress,
  mockCeloTokenId,
  mockCeurAddress,
  mockCeurTokenId,
  mockContract,
  mockTokenBalances,
} from 'test/values'
import { zeroAddress } from 'viem'

const loggerErrorSpy = jest.spyOn(Logger, 'error')

const contractKit = {
  getWallet: jest.fn(),
  getAccounts: jest.fn(),
  connection: {
    chainId: jest.fn(() => '42220'),
    nonce: jest.fn(),
    gasPrice: jest.fn(),
  },
}

jest.mock('src/transactions/send', () => ({
  sendTransaction: jest.fn(() => ({ transactionHash: '0x123', blockNumber: '1234', status: true })),
}))

const mockSwapTransaction: SwapTransaction = {
  buyAmount: '10000000000000000',
  sellAmount: '10000000000000000',
  buyTokenAddress: mockCeloAddress,
  sellTokenAddress: mockCeurAddress,
  price: '1',
  guaranteedPrice: '1.02',
  from: '0x078e54ad49b0865fff9086fd084b92b3dac0857d',
  gas: '460533',
  allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
  estimatedPriceImpact: '0.1',
} as SwapTransaction // there are lots fields in this type that are not needed for testing

const mockQuoteReceivedTimestamp = 1000000000000

const mockSwap: PayloadAction<SwapInfo> = {
  type: 'swap/swapStart',
  payload: {
    approveTransaction: {
      gas: '59480',
      from: mockAccount,
      chainId: 42220,
      data: '0x0',
      to: '0xabc',
    },
    userInput: {
      updatedField: Field.TO,
      fromToken: mockCeurAddress,
      toToken: mockCeloAddress,
      swapAmount: {
        [Field.FROM]: '100',
        [Field.TO]: '200',
      },
    },
    unvalidatedSwapTransaction: {
      ...mockSwapTransaction,
    },
    details: {
      swapProvider: '0x',
    },
    quoteReceivedAt: mockQuoteReceivedTimestamp,
  },
}

const mockSwapWithNativeSellToken: PayloadAction<SwapInfo> = {
  ...mockSwap,
  payload: {
    ...mockSwap.payload,
    unvalidatedSwapTransaction: {
      ...mockSwap.payload.unvalidatedSwapTransaction,
      allowanceTarget: zeroAddress,
    },
  },
}

const store = createMockStore({
  tokens: {
    tokenBalances: {
      [mockCeurTokenId]: {
        ...mockTokenBalances[mockCeurTokenId],
        priceUsd: '1',
        balance: '10',
      },
      [mockCeloTokenId]: {
        ...mockTokenBalances[mockCeloTokenId],
        priceUsd: '0.5',
        balance: '10',
      },
    },
  },
})

describe(swapSubmitSaga, () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.spyOn(Date, 'now').mockRestore()
  })

  const defaultProviders: (EffectProviders | StaticProvider)[] = [
    [select(walletAddressSelector), mockAccount],
    [call(getContractKit), contractKit],
    [call(getConnectedUnlockedAccount), mockAccount],
    [
      call(getERC20TokenContract, mockSwap.payload.unvalidatedSwapTransaction.sellTokenAddress),
      mockContract,
    ],
  ]

  it('should complete swap', async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(mockQuoteReceivedTimestamp + 2500) // swap submitted timestamp
      .mockReturnValue(mockQuoteReceivedTimestamp + 10000) // before send swap timestamp

    await expectSaga(swapSubmitSaga, mockSwap)
      .withState(store.getState())
      .provide(defaultProviders)
      .put(swapApprove())
      .put(swapExecute())
      .put.like({
        action: {
          type: Actions.ADD_STANDBY_TRANSACTION,
          transaction: {
            __typename: 'TokenExchangeV3',
            type: TokenTransactionTypeV2.SwapTransaction,
            inAmount: {
              value: BigNumber('0.0102'), // guaranteedPrice * sellAmount
              tokenId: mockCeloTokenId,
            },
            outAmount: {
              value: BigNumber('0.01'),
              tokenId: mockCeurTokenId,
            },
          },
        },
      })
      .put.like({
        action: {
          type: Actions.TRANSACTION_CONFIRMED,
          receipt: {
            transactionHash: '0x123',
            block: '1234',
            status: true,
          },
        },
      })
      .run()
    expect(sendTransaction).toHaveBeenCalledTimes(2)
    expect(loggerErrorSpy).not.toHaveBeenCalled()

    expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
    expect(ValoraAnalytics.track).toHaveBeenCalledWith(SwapEvents.swap_execute_success, {
      toToken: mockCeloAddress,
      fromToken: mockCeurAddress,
      amount: '10000000000000000',
      amountType: 'buyAmount',
      price: '1',
      allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      estimatedPriceImpact: '0.1',
      provider: '0x',
      fromTokenBalance: '10000000000000000000',
      swapApproveTxId: 'a uuid',
      swapExecuteTxId: 'a uuid',
      quoteToUserConfirmsSwapElapsedTimeInMs: 2500,
      quoteToTransactionElapsedTimeInMs: 10000,
      estimatedBuyTokenUsdValue: 0.005,
      estimatedSellTokenUsdValue: 0.01,
    })
  })

  it('should complete swap without approval for native sell token', async () => {
    await expectSaga(swapSubmitSaga, mockSwapWithNativeSellToken)
      .withState(store.getState())
      .provide(defaultProviders)
      .not.put(swapApprove())
      .put(swapExecute())
      .put.like({
        action: {
          type: Actions.ADD_STANDBY_TRANSACTION,
          transaction: {
            __typename: 'TokenExchangeV3',
            type: TokenTransactionTypeV2.SwapTransaction,
            inAmount: {
              value: BigNumber('0.0102'), // guaranteedPrice * sellAmount
              tokenId: mockCeloTokenId,
            },
            outAmount: {
              value: BigNumber('0.01'),
              tokenId: mockCeurTokenId,
            },
          },
        },
      })
      .run()

    expect(sendTransaction).toHaveBeenCalledTimes(1)
    expect(loggerErrorSpy).not.toHaveBeenCalled()
  })

  it('should set swap state correctly on error', async () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(mockQuoteReceivedTimestamp + 30000) // swap submitted timestamp
    jest.mocked(sendTransaction).mockImplementationOnce(() => {
      throw new Error('fake error')
    })
    await expectSaga(swapSubmitSaga, mockSwap)
      .withState(store.getState())
      .provide(defaultProviders)
      .put(swapApprove())
      .put(swapError())
      .run()
    expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
    expect(ValoraAnalytics.track).toHaveBeenCalledWith(SwapEvents.swap_execute_error, {
      error: 'fake error',
      toToken: mockCeloAddress,
      fromToken: mockCeurAddress,
      amount: '10000000000000000',
      amountType: 'buyAmount',
      price: '1',
      allowanceTarget: '0xdef1c0ded9bec7f1a1670819833240f027b25eff',
      estimatedPriceImpact: '0.1',
      provider: '0x',
      fromTokenBalance: '10000000000000000000',
      swapApproveTxId: 'a uuid',
      swapExecuteTxId: 'a uuid',
      quoteToUserConfirmsSwapElapsedTimeInMs: 30000,
      quoteToTransactionElapsedTimeInMs: undefined,
      estimatedBuyTokenUsdValue: 0.005,
      estimatedSellTokenUsdValue: 0.01,
    })
  })

  it('should set swap state correctly on price change', async () => {
    mockSwap.payload.unvalidatedSwapTransaction.guaranteedPrice = '1.021'
    await expectSaga(swapSubmitSaga, mockSwap)
      .withState(store.getState())
      .provide(defaultProviders)
      .put(swapPriceChange())
      .run()

    expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
    expect(ValoraAnalytics.track).toHaveBeenCalledWith(SwapEvents.swap_execute_price_change, {
      price: '1',
      guaranteedPrice: '1.021',
      toToken: mockCeloAddress,
      fromToken: mockCeurAddress,
    })
  })
})
