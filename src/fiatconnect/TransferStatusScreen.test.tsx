import { FiatAccountSchema, FiatAccountType } from '@fiatconnect/fiatconnect-types'
import { fireEvent, render } from '@testing-library/react-native'
import React from 'react'
import { Provider } from 'react-redux'
import { FiatExchangeEvents } from 'src/analytics/Events'
import ValoraAnalytics from 'src/analytics/ValoraAnalytics'
import { FiatConnectQuoteSuccess } from 'src/fiatconnect'
import { FiatConnectTransfer } from 'src/fiatconnect/slice'
import TransferStatusScreen from 'src/fiatconnect/TransferStatusScreen'
import FiatConnectQuote from 'src/fiatExchanges/quotes/FiatConnectQuote'
import { CICOFlow } from 'src/fiatExchanges/utils'
import { navigate, navigateHome } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import networkConfig from 'src/web3/networkConfig'
import { createMockStore, getMockStackScreenProps } from 'test/utils'
import { mockFiatConnectQuotes } from 'test/values'

jest.mock('src/analytics/ValoraAnalytics')

const mockFiatConnectTransfers: FiatConnectTransfer[] = [
  {
    flow: CICOFlow.CashOut,
    quoteId: 'mock_quote_out_id',
    isSending: false,
    failed: false,
    txHash: '0xc7a9b0f4354e6279cb476d4c91d5bbc5db6ad29aa8611408de7aee6d2e7fe7c72',
  },
  {
    flow: CICOFlow.CashOut,
    quoteId: 'mock_quote_out_id',
    isSending: false,
    failed: true,
    txHash: null,
  },
  {
    flow: CICOFlow.CashIn,
    quoteId: 'mock_quote_in_id',
    isSending: false,
    failed: false,
    txHash: null,
  },
  {
    flow: CICOFlow.CashIn,
    quoteId: 'mock_quote_in_id',
    isSending: false,
    failed: true,
    txHash: null,
  },
  {
    flow: CICOFlow.CashIn,
    quoteId: 'mock_quote_in_id',
    isSending: true,
    failed: false,
    txHash: null,
  },
]

describe('TransferStatusScreen', () => {
  const mockStore = (overrides: any = {}) => {
    const store = createMockStore({
      fiatConnect: {
        transfer: mockFiatConnectTransfers[0],
        ...overrides,
      },
    })
    store.dispatch = jest.fn()
    return store
  }

  const getQuote = (flow: CICOFlow) =>
    new FiatConnectQuote({
      flow,
      fiatAccountType: FiatAccountType.BankAccount,
      quote: mockFiatConnectQuotes[1] as FiatConnectQuoteSuccess,
    })

  const mockScreenProps = (flow: CICOFlow) =>
    getMockStackScreenProps(Screens.FiatConnectTransferStatus, {
      flow,
      fiatAccount: {
        fiatAccountId: 'some-fiat-account-id',
        accountName: 'some-friendly-name',
        institutionName: 'some-bank',
        fiatAccountType: FiatAccountType.BankAccount,
        fiatAccountSchema: FiatAccountSchema.AccountNumber,
        providerId: 'provider-two',
      },
      normalizedQuote: getQuote(flow),
    })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('success view', () => {
    it('sets header options', () => {
      const store = mockStore()
      const mockProps = mockScreenProps(CICOFlow.CashOut)
      render(
        <Provider store={store}>
          <TransferStatusScreen {...mockProps} />
        </Provider>
      )
      expect(mockProps.navigation.setOptions).toBeCalledWith(
        expect.objectContaining({
          headerTitle: 'fiatConnectStatusScreen.success.header',
        })
      )
    })
    it('navigates home on success for transfer outs', () => {
      const store = mockStore()
      const { queryByTestId, getByTestId } = render(
        <Provider store={store}>
          <TransferStatusScreen {...mockScreenProps(CICOFlow.CashOut)} />
        </Provider>
      )
      expect(queryByTestId('Continue')).toBeTruthy()
      fireEvent.press(getByTestId('Continue'))
      expect(navigateHome).toHaveBeenCalledWith()
      expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
      expect(ValoraAnalytics.track).toHaveBeenCalledWith(
        FiatExchangeEvents.cico_fc_transfer_success_complete,
        {
          provider: 'provider-two',
          flow: CICOFlow.CashOut,
          txHash: '0xc7a9b0f4354e6279cb476d4c91d5bbc5db6ad29aa8611408de7aee6d2e7fe7c72',
        }
      )
    })
    it('shows TX details on Celo Explorer on success for transfer outs', () => {
      const store = mockStore()
      const { queryByTestId, getByTestId } = render(
        <Provider store={store}>
          <TransferStatusScreen {...mockScreenProps(CICOFlow.CashOut)} />
        </Provider>
      )
      expect(queryByTestId('txDetails')).toBeTruthy()
      fireEvent.press(getByTestId('txDetails'))
      expect(navigate).toHaveBeenCalledWith(Screens.WebViewScreen, {
        uri: `${networkConfig.celoExplorerBaseTxUrl}${mockFiatConnectTransfers[0].txHash}`,
      })
      expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
      expect(ValoraAnalytics.track).toHaveBeenCalledWith(
        FiatExchangeEvents.cico_fc_transfer_success_view_tx,
        {
          provider: 'provider-two',
          flow: CICOFlow.CashOut,
          txHash: '0xc7a9b0f4354e6279cb476d4c91d5bbc5db6ad29aa8611408de7aee6d2e7fe7c72',
        }
      )
    })
    it('does not show tx details and navigates home on success for transfer ins', () => {
      const store = mockStore({ transfer: mockFiatConnectTransfers[2] })
      const { queryByTestId, getByTestId } = render(
        <Provider store={store}>
          <TransferStatusScreen {...mockScreenProps(CICOFlow.CashIn)} />
        </Provider>
      )
      expect(queryByTestId('Continue')).toBeTruthy()
      fireEvent.press(getByTestId('Continue'))
      expect(navigateHome).toHaveBeenCalledWith()
      expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
      expect(ValoraAnalytics.track).toHaveBeenCalledWith(
        FiatExchangeEvents.cico_fc_transfer_success_complete,
        {
          provider: 'provider-two',
          flow: CICOFlow.CashIn,
          txHash: undefined,
        }
      )
      expect(queryByTestId('txDetails')).toBeFalsy()
    })
  })

  describe('failure view', () => {
    it.each([
      [CICOFlow.CashIn, 'add'],
      [CICOFlow.CashOut, 'withdraw'],
    ])('sets header options for %s', (flow, header) => {
      const store = mockStore({ transfer: mockFiatConnectTransfers[1] })
      const mockProps = mockScreenProps(flow)
      let headerRightButton: React.ReactNode
      ;(mockProps.navigation.setOptions as jest.Mock).mockImplementation((options) => {
        headerRightButton = options.headerRight()
      })
      render(
        <Provider store={store}>
          <TransferStatusScreen {...mockProps} />
        </Provider>
      )
      expect(mockProps.navigation.setOptions).toBeCalledWith(
        expect.objectContaining({
          headerLeft: expect.any(Function),
          headerRight: expect.any(Function),
        })
      )

      const { getByText, getByTestId } = render(
        <Provider store={store}>{headerRightButton}</Provider>
      )
      expect(getByText(`fiatConnectStatusScreen.${header}.cancel`)).toBeTruthy()
      fireEvent.press(getByTestId('Cancel'))
      expect(navigateHome).toHaveBeenCalledWith()
      expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
      expect(ValoraAnalytics.track).toHaveBeenCalledWith(
        FiatExchangeEvents.cico_fc_transfer_error_cancel,
        {
          provider: 'provider-two',
          flow,
        }
      )
    })
    it('navigates to review screen when try again button is pressed on failure', () => {
      const store = mockStore({ transfer: mockFiatConnectTransfers[1] })
      const { queryByTestId, getByTestId } = render(
        <Provider store={store}>
          <TransferStatusScreen {...mockScreenProps(CICOFlow.CashOut)} />
        </Provider>
      )
      expect(queryByTestId('TryAgain')).toBeTruthy()
      fireEvent.press(getByTestId('TryAgain'))
      expect(navigate).toHaveBeenCalledWith(Screens.FiatConnectReview, {
        flow: CICOFlow.CashOut,
        fiatAccount: {
          fiatAccountId: 'some-fiat-account-id',
          accountName: 'some-friendly-name',
          institutionName: 'some-bank',
          fiatAccountType: FiatAccountType.BankAccount,
          fiatAccountSchema: FiatAccountSchema.AccountNumber,
          providerId: 'provider-two',
        },
        normalizedQuote: getQuote(CICOFlow.CashOut),
        shouldRefetchQuote: true,
      })
      expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
      expect(ValoraAnalytics.track).toHaveBeenCalledWith(
        FiatExchangeEvents.cico_fc_transfer_error_retry,
        {
          provider: 'provider-two',
          flow: CICOFlow.CashOut,
        }
      )
    })
    it.each([
      [CICOFlow.CashIn, 'add'],
      [CICOFlow.CashOut, 'withdraw'],
    ])(
      'navigates to support page when contact support button is pressed on failure for %s',
      (flow, text) => {
        const store = mockStore({ transfer: mockFiatConnectTransfers[1] })
        const { queryByTestId, getByTestId } = render(
          <Provider store={store}>
            <TransferStatusScreen {...mockScreenProps(flow)} />
          </Provider>
        )
        expect(queryByTestId('SupportContactLink')).toBeTruthy()
        fireEvent.press(getByTestId('SupportContactLink'))
        expect(navigate).toHaveBeenCalledWith(Screens.SupportContact, {
          prefilledText: `fiatConnectStatusScreen.${text}.contactSupportPrefill`,
        })
        expect(ValoraAnalytics.track).toHaveBeenCalledTimes(1)
        expect(ValoraAnalytics.track).toHaveBeenCalledWith(
          FiatExchangeEvents.cico_fc_transfer_error_contact_support,
          {
            provider: 'provider-two',
            flow,
          }
        )
      }
    )
  })

  describe('loading view', () => {
    it('shows loading screen with no headers', () => {
      const mockProps = mockScreenProps(CICOFlow.CashIn)
      const store = mockStore({ transfer: mockFiatConnectTransfers[4] })
      const { getByTestId } = render(
        <Provider store={store}>
          <TransferStatusScreen {...mockProps} />
        </Provider>
      )
      expect(getByTestId('loadingTransferStatus')).toBeTruthy()
      expect(mockProps.navigation.setOptions).not.toBeCalled()
    })
  })
})
