import { fireEvent, render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import { Provider } from 'react-redux'
import { openUrl } from 'src/app/actions'
import { fetchAvailableRewards } from 'src/consumerIncentives/slice'
import NotificationCenter from 'src/home/NotificationCenter'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { cancelPaymentRequest, updatePaymentRequestNotified } from 'src/paymentRequest/actions'
import { multiplyByWei } from 'src/utils/formatting'
import { createMockStore, getElementText, getMockStackScreenProps } from 'test/utils'
import {
  mockCusdAddress,
  mockE164Number,
  mockE164NumberPepper,
  mockEscrowedPayment,
  mockPaymentRequests,
} from 'test/values'

const TWO_DAYS_MS = 2 * 24 * 60 * 1000
const BACKUP_TIME = new Date().getTime() - TWO_DAYS_MS

const testNotification = {
  ctaUri: 'https://celo.org',
  priority: 20,
  content: {
    en: {
      body: 'Body Text',
      cta: 'Start',
      dismiss: 'Dismiss',
    },
  },
}

const storeDataNotificationsDisabled = {
  account: {
    backupCompleted: true,
    dismissedInviteFriends: true,
    dismissedGetVerified: true,
    accountCreationTime: BACKUP_TIME,
    celoEducationCompleted: true,
    dismissedStartSupercharging: true,
  },
  escrow: {
    sentEscrowedPayments: [],
  },
  paymentRequest: {
    incomingPaymentRequests: [],
    outgoingPaymentRequests: [],
  },
  home: {
    notifications: {
      testNotification: {
        ...testNotification,
        dismissed: true,
      },
    },
  },
}

const testReward = {
  amount: '2',
  contractAddress: 'contractAddress',
  createdAt: Date.now(),
  index: 0,
  proof: [],
  tokenAddress: '0xcusd',
}

const superchargeSetUp = {
  web3: {
    account: 'account',
  },
  app: {
    numberVerified: true,
  },
  supercharge: {
    availableRewards: [testReward],
  },
}

const superchargeWithoutRewardsSetUp = {
  ...superchargeSetUp,
  supercharge: {
    availableRewards: [],
  },
}

const mockcUsdBalance = {
  [mockCusdAddress]: {
    address: mockCusdAddress,
    isCoreToken: true,
    balance: '100',
    symbol: 'cUSD',
    usdPrice: '1',
    priceFetchedAt: Date.now(),
  },
}

const mockcUsdWithoutEnoughBalance = {
  [mockCusdAddress]: {
    address: mockCusdAddress,
    isCoreToken: true,
    balance: '5',
    symbol: 'cUSD',
    usdPrice: '1',
    priceFetchedAt: Date.now(),
  },
}

describe('NotificationCenter', () => {
  it('renders empty state when there is no notifications at all', () => {
    const store = createMockStore({ ...storeDataNotificationsDisabled })
    const { getByTestId, getByText } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(getByTestId('NotificationCenter/EmptyState')).toBeTruthy()
    expect(getByText('noNotificationsPlaceholder')).toBeTruthy()
  })

  it('renders reverify notification if decentrally verified and not CPV', () => {
    const store = createMockStore({
      app: {
        requireCPV: true,
        numberVerified: true,
        phoneNumberVerified: false,
      },
    })
    const { getByText } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(getByText('reverifyUsingCPVHomecard.description')).toBeTruthy()

    fireEvent.press(getByText('reverifyUsingCPVHomecard.buttonLabel'))
    expect(navigate).toHaveBeenCalledWith(Screens.VerificationStartScreen, {
      hideOnboardingStep: true,
    })
  })

  it('renders incoming payment request when it exists', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
      },
      paymentRequest: {
        incomingPaymentRequests: [mockPaymentRequests[0]],
      },
    })
    const { getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    const titleElement = getByTestId('IncomingPaymentRequestNotification/FAKE_ID_1/Title')
    expect(getElementText(titleElement)).toBe(
      'incomingPaymentRequestNotificationTitle, {"name":"Jane Doe"}'
    )
    const amountElement = getByTestId('IncomingPaymentRequestNotification/FAKE_ID_1/Amount')
    expect(getElementText(amountElement)).toBe('₱266,000.00')
    const detailsElement = getByTestId('IncomingPaymentRequestNotification/FAKE_ID_1/Details')
    expect(getElementText(detailsElement)).toBe('Dinner for me and the gals, PIZZAA!')
  })

  it('renders incoming payment requests in reverse chronological order', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
      },
      paymentRequest: {
        incomingPaymentRequests: mockPaymentRequests,
      },
    })
    const { getAllByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    const items = getAllByTestId(/IncomingPaymentRequestNotification\/FAKE_ID_[1-3]\/Amount/)
    expect(getElementText(items[0])).toBe('₱1,641.96')
    expect(getElementText(items[1])).toBe('₱240.58')
    expect(getElementText(items[2])).toBe('₱266,000.00')
  })

  it('renders outgoing payment request when it exists', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
      },
      paymentRequest: {
        outgoingPaymentRequests: [mockPaymentRequests[0]],
      },
    })
    const { getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    const titleElement = getByTestId('OutgoingPaymentRequestNotification/FAKE_ID_1/Title')
    expect(getElementText(titleElement)).toBe(
      'outgoingPaymentRequestNotificationTitle, {"name":"John Doe"}'
    )
    const amountElement = getByTestId('OutgoingPaymentRequestNotification/FAKE_ID_1/Amount')
    expect(getElementText(amountElement)).toBe('₱266,000.00')
    const detailsElement = getByTestId('OutgoingPaymentRequestNotification/FAKE_ID_1/Details')
    expect(getElementText(detailsElement)).toBe('Dinner for me and the gals, PIZZAA!')
  })

  it('dispatches correct events when outgoing payment request buttons are pressed', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
      },
      paymentRequest: {
        outgoingPaymentRequests: [mockPaymentRequests[0]],
      },
    })
    const { getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    const remindButton = getByTestId(
      'OutgoingPaymentRequestNotification/FAKE_ID_1/CallToActions/remind/Button'
    )
    fireEvent.press(remindButton)
    expect(store.getActions().at(-1)).toEqual(updatePaymentRequestNotified('FAKE_ID_1', false))

    const cancelButton = getByTestId(
      'OutgoingPaymentRequestNotification/FAKE_ID_1/CallToActions/cancel/Button'
    )
    fireEvent.press(cancelButton)
    expect(store.getActions().at(-1)).toEqual(cancelPaymentRequest('FAKE_ID_1'))
  })

  it('renders outgoing payment requests in reverse chronological order', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
      },
      paymentRequest: {
        outgoingPaymentRequests: mockPaymentRequests,
      },
    })
    const { getAllByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    const items = getAllByTestId(/OutgoingPaymentRequestNotification\/FAKE_ID_[1-3]\/Amount/)
    expect(getElementText(items[0])).toBe('₱1,641.96')
    expect(getElementText(items[1])).toBe('₱240.58')
    expect(getElementText(items[2])).toBe('₱266,000.00')
  })

  it('renders sent escrowed payment when it exists', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
      },
      escrow: {
        sentEscrowedPayments: [
          {
            ...mockEscrowedPayment,
            amount: multiplyByWei(new BigNumber(10)).toString(),
            message: 'Welcome!',
          },
        ],
      },
    })
    const { getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(getElementText(getByTestId('EscrowedPaymentListItem/Title'))).toBe(
      'escrowPaymentNotificationTitle, {"mobile":"John Doe"}'
    )
    expect(getElementText(getByTestId('EscrowedPaymentListItem/Amount'))).toBe('₱13.30')
    expect(getElementText(getByTestId('EscrowedPaymentListItem/Details'))).toBe('Welcome!')
  })

  it('renders sent escrowed payments in reverse chronological order', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
      },
      escrow: {
        sentEscrowedPayments: [
          {
            ...mockEscrowedPayment,
            timestamp: new BigNumber(1000),
            amount: multiplyByWei(new BigNumber(10)).toString(),
            message: 'Welcome!',
          },
          {
            ...mockEscrowedPayment,
            timestamp: new BigNumber(2000),
            amount: multiplyByWei(new BigNumber(20)).toString(),
          },
          {
            ...mockEscrowedPayment,
            timestamp: new BigNumber(3000),
            amount: multiplyByWei(new BigNumber(30)).toString(),
          },
        ],
      },
    })
    const { getAllByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    const items = getAllByTestId('EscrowedPaymentListItem/Amount')
    expect(getElementText(items[0])).toBe('₱39.90')
    expect(getElementText(items[1])).toBe('₱26.60')
    expect(getElementText(items[2])).toBe('₱13.30')
  })

  it('renders verification reminder when not verified', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      account: {
        ...storeDataNotificationsDisabled.account,
        dismissedGetVerified: false,
        e164PhoneNumber: mockE164Number,
      },
      identity: { e164NumberToSalt: { [mockE164Number]: mockE164NumberPepper } },
    })
    const { getByText } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )
    expect(getByText('notification.body')).toBeTruthy()
  })

  it('does not render verification reminder when insufficient balance', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
    })
    const { queryByText } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )
    expect(queryByText('notification.body')).toBeFalsy()
  })

  it('renders all remote notifications that were not dismissed', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      home: {
        notifications: {
          notification1: {
            ...testNotification,
            dismissed: true,
            content: {
              en: {
                ...testNotification.content.en,
                body: 'Notification 1',
              },
            },
          },
          notification2: {
            ...testNotification,
            content: {
              en: {
                ...testNotification.content.en,
                body: 'Notification 2',
              },
            },
          },
          notification3: {
            ...testNotification,
            content: {
              en: {
                ...testNotification.content.en,
                body: 'Notification 3',
                cta: 'Press Remote',
              },
            },
          },
        },
      },
    })
    const { queryByText, getByText } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )
    expect(queryByText('Notification 1')).toBeFalsy()
    expect(queryByText('Notification 2')).toBeTruthy()
    expect(queryByText('Notification 3')).toBeTruthy()

    expect(store.getActions()).toEqual([fetchAvailableRewards()])

    fireEvent.press(getByText('Press Remote'))
    expect(store.getActions()).toEqual([
      fetchAvailableRewards(),
      openUrl(testNotification.ctaUri, false, true),
    ])
  })

  it('renders notifications that open URL internally or externally', () => {
    const store = createMockStore({
      ...storeDataNotificationsDisabled,
      home: {
        notifications: {
          notification1: {
            ...testNotification,
            content: {
              en: {
                ...testNotification.content.en,
                body: 'Notification 1',
                cta: 'Press Internal',
              },
            },
          },
          notification2: {
            ...testNotification,
            openExternal: true,
            content: {
              en: {
                ...testNotification.content.en,
                body: 'Notification 2',
                cta: 'Press External',
              },
            },
          },
        },
      },
    })
    const { queryByText, getByText } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )
    expect(queryByText('Notification 1')).toBeTruthy()
    expect(queryByText('Notification 2')).toBeTruthy()

    expect(store.getActions()).toEqual([fetchAvailableRewards()])

    fireEvent.press(getByText('Press Internal'))
    expect(store.getActions()).toEqual([
      fetchAvailableRewards(),
      openUrl(testNotification.ctaUri, false, true),
    ])
    fireEvent.press(getByText('Press External'))
    expect(store.getActions()).toEqual([
      fetchAvailableRewards(),
      openUrl(testNotification.ctaUri, false, true),
      openUrl(testNotification.ctaUri, true, true),
    ])
  })

  it('renders claim rewards notification when there are supercharge rewards', () => {
    const store = createMockStore(superchargeSetUp)
    const { queryByTestId, getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(queryByTestId('NotificationView/claimSuperchargeRewards')).toBeTruthy()
    expect(queryByTestId('NotificationView/keepSupercharging')).toBeFalsy()
    expect(queryByTestId('NotificationView/startSupercharging')).toBeFalsy()

    fireEvent.press(
      getByTestId('claimSuperchargeRewards/CallToActions/superchargeNotificationStart/Button')
    )
    expect(navigate).toHaveBeenCalledWith(Screens.ConsumerIncentivesHomeScreen)
  })

  it('renders keep supercharging notification when expected', () => {
    const store = createMockStore({
      ...superchargeWithoutRewardsSetUp,
      tokens: {
        tokenBalances: mockcUsdBalance,
      },
    })
    const { queryByTestId, getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(queryByTestId('NotificationView/claimSuperchargeRewards')).toBeFalsy()
    expect(queryByTestId('NotificationView/keepSupercharging')).toBeTruthy()
    expect(queryByTestId('NotificationView/startSupercharging')).toBeFalsy()

    fireEvent.press(
      getByTestId('keepSupercharging/CallToActions/superchargingNotificationStart/Button')
    )
    expect(navigate).toHaveBeenCalledWith(Screens.ConsumerIncentivesHomeScreen)
  })

  it('does not render keep supercharging because is dismissed', () => {
    const store = createMockStore({
      ...superchargeWithoutRewardsSetUp,
      tokens: {
        tokenBalances: mockcUsdBalance,
      },
      account: {
        dismissedKeepSupercharging: true,
      },
    })
    const { queryByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(queryByTestId('NotificationView/claimSuperchargeRewards')).toBeFalsy()
    expect(queryByTestId('NotificationView/keepSupercharging')).toBeFalsy()
    expect(queryByTestId('NotificationView/startSupercharging')).toBeFalsy()
  })

  it('renders start supercharging notification if number is not verified', () => {
    const store = createMockStore({
      ...superchargeWithoutRewardsSetUp,
      tokens: {
        tokenBalances: mockcUsdBalance,
      },
      app: {
        ...superchargeWithoutRewardsSetUp.app,
        numberVerified: false,
      },
    })
    const { queryByTestId, getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(queryByTestId('NotificationView/claimSuperchargeRewards')).toBeFalsy()
    expect(queryByTestId('NotificationView/keepSupercharging')).toBeFalsy()
    expect(queryByTestId('NotificationView/startSupercharging')).toBeTruthy()

    fireEvent.press(
      getByTestId('startSupercharging/CallToActions/startSuperchargingNotificationStart/Button')
    )
    expect(navigate).toHaveBeenCalledWith(Screens.ConsumerIncentivesHomeScreen)
  })

  it('renders start supercharging notification if user does not have enough balance', () => {
    const store = createMockStore({
      ...superchargeWithoutRewardsSetUp,
      tokens: {
        tokenBalances: mockcUsdWithoutEnoughBalance,
      },
    })
    const { queryByTestId, getByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(queryByTestId('NotificationView/claimSuperchargeRewards')).toBeFalsy()
    expect(queryByTestId('NotificationView/keepSupercharging')).toBeFalsy()
    expect(queryByTestId('NotificationView/startSupercharging')).toBeTruthy()

    fireEvent.press(
      getByTestId('startSupercharging/CallToActions/startSuperchargingNotificationStart/Button')
    )
    expect(navigate).toHaveBeenCalledWith(Screens.ConsumerIncentivesHomeScreen)
  })

  it('does not render start supercharging because is dismissed', () => {
    const store = createMockStore({
      ...superchargeWithoutRewardsSetUp,
      tokens: {
        tokenBalances: mockcUsdWithoutEnoughBalance,
      },
      account: {
        dismissedStartSupercharging: true,
      },
    })
    const { queryByTestId } = render(
      <Provider store={store}>
        <NotificationCenter {...getMockStackScreenProps(Screens.NotificationCenter)} />
      </Provider>
    )

    expect(queryByTestId('NotificationView/claimSuperchargeRewards')).toBeFalsy()
    expect(queryByTestId('NotificationView/keepSupercharging')).toBeFalsy()
    expect(queryByTestId('NotificationView/startSupercharging')).toBeFalsy()
  })
})
