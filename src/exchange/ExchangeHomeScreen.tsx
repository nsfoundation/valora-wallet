import BigNumber from 'bignumber.js'
import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useDispatch } from 'react-redux'
import { CeloExchangeEvents } from 'src/analytics/Events'
import ValoraAnalytics from 'src/analytics/ValoraAnalytics'
import { celoNewsConfigSelector } from 'src/app/selectors'
import Touchable from 'src/components/Touchable'
import { fetchExchangeRate } from 'src/exchange/actions'
import CeloGoldHistoryChart from 'src/exchange/CeloGoldHistoryChart'
import CeloNewsFeed from 'src/exchange/CeloNewsFeed'
import { exchangeHistorySelector } from 'src/exchange/reducer'
import InfoIcon from 'src/icons/InfoIcon'
import { LocalCurrencyCode } from 'src/localCurrency/consts'
import { convertDollarsToLocalAmount } from 'src/localCurrency/convert'
import { getLocalCurrencyToDollarsExchangeRate } from 'src/localCurrency/selectors'
import DrawerTopBar from 'src/navigator/DrawerTopBar'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { default as useSelector } from 'src/redux/useSelector'
import DisconnectBanner from 'src/shared/DisconnectBanner'
import colors from 'src/styles/colors'
import fontStyles from 'src/styles/fonts'
import variables from 'src/styles/variables'
import { tokensBySymbolSelector } from 'src/tokens/selectors'
import { getLocalCurrencyDisplayValue } from 'src/utils/formatting'

function navigateToGuide() {
  ValoraAnalytics.track(CeloExchangeEvents.celo_home_info)
  navigate(Screens.GoldEducation)
}

function ExchangeHomeScreen() {
  function dollarsToLocal(amount: BigNumber.Value) {
    return convertDollarsToLocalAmount(amount, localCurrencyCode ? localExchangeRate : 1)
  }

  function displayLocalCurrency(amount: BigNumber.Value) {
    return getLocalCurrencyDisplayValue(amount, localCurrencyCode || LocalCurrencyCode.USD, true)
  }

  const scrollPosition = useRef(new Animated.Value(0)).current
  const onScroll = Animated.event([
    {
      nativeEvent: {
        contentOffset: {
          y: scrollPosition,
        },
      },
    },
  ])
  const headerOpacity = useMemo(
    () => ({
      opacity: scrollPosition.interpolate({
        inputRange: [0, 100],
        outputRange: [0, 1],
        extrapolate: Animated.Extrapolate.CLAMP,
      }),
    }),
    []
  )

  const dispatch = useDispatch()
  useEffect(() => {
    dispatch(fetchExchangeRate())
  }, [])

  const { t } = useTranslation()

  const isCeloNewsEnabled = useSelector(celoNewsConfigSelector).enabled
  const tokensBySymbol = useSelector(tokensBySymbolSelector)

  // TODO: revert this back to `useLocalCurrencyCode()` when we have history data for cGDL to Local Currency.
  const localCurrencyCode = null
  const localExchangeRate = useSelector(getLocalCurrencyToDollarsExchangeRate)
  const exchangeHistory = useSelector(exchangeHistorySelector)
  const exchangeHistoryLength = exchangeHistory.aggregatedExchangeRates.length
  const lastKnownUsdPrice =
    tokensBySymbol.CGLD?.lastKnownUsdPrice ||
    (exchangeHistoryLength &&
      exchangeHistory.aggregatedExchangeRates[exchangeHistoryLength - 1].exchangeRate) ||
    new BigNumber(0)

  const currentGoldRateInLocalCurrency = dollarsToLocal(lastKnownUsdPrice)
  let rateChangeInPercentage, rateWentUp

  if (exchangeHistoryLength) {
    const oldestGoldRateInLocalCurrency = dollarsToLocal(
      exchangeHistory.aggregatedExchangeRates[0].exchangeRate
    )
    if (oldestGoldRateInLocalCurrency) {
      const rateChange = currentGoldRateInLocalCurrency?.minus(oldestGoldRateInLocalCurrency)
      rateChangeInPercentage = currentGoldRateInLocalCurrency
        ?.div(oldestGoldRateInLocalCurrency)
        .minus(1)
        .multipliedBy(100)

      rateWentUp = rateChange?.gt(0)
    }
  }

  return (
    <SafeAreaView style={styles.background} edges={['top']}>
      <DrawerTopBar
        scrollPosition={scrollPosition}
        middleElement={
          <Animated.View style={[styles.header, headerOpacity]}>
            {currentGoldRateInLocalCurrency && (
              <Text style={styles.goldPriceCurrentValueHeader}>
                {getLocalCurrencyDisplayValue(
                  currentGoldRateInLocalCurrency,
                  LocalCurrencyCode.USD,
                  true
                )}
              </Text>
            )}
            {rateChangeInPercentage && (
              <Text
                style={rateWentUp ? styles.goldPriceWentUpHeader : styles.goldPriceWentDownHeader}
              >
                {rateWentUp ? '▴' : '▾'} {rateChangeInPercentage.toFormat(2)}%
              </Text>
            )}
          </Animated.View>
        }
      />
      <Animated.ScrollView
        scrollEventThrottle={16}
        onScroll={onScroll}
        // style={styles.background}
        testID="ExchangeScrollView"
        stickyHeaderIndices={[]}
        contentContainerStyle={styles.contentContainer}
      >
        <SafeAreaView style={styles.background} edges={['bottom']}>
          <DisconnectBanner />
          <View style={styles.goldPrice}>
            <View style={styles.goldPriceTitleArea}>
              <Text style={styles.goldPriceTitle}>{t('goldPrice')}</Text>
              <Touchable onPress={navigateToGuide} hitSlop={variables.iconHitslop}>
                <InfoIcon size={14} />
              </Touchable>
            </View>
            <View style={styles.goldPriceValues}>
              <Text style={styles.goldPriceCurrentValue}>
                {currentGoldRateInLocalCurrency
                  ? displayLocalCurrency(currentGoldRateInLocalCurrency)
                  : '-'}
              </Text>

              {rateChangeInPercentage && (
                <Text style={rateWentUp ? styles.goldPriceWentUp : styles.goldPriceWentDown}>
                  {rateWentUp ? '▴' : '▾'} {rateChangeInPercentage.toFormat(2)}%
                </Text>
              )}
            </View>
          </View>

          <CeloGoldHistoryChart />
          {isCeloNewsEnabled && <CeloNewsFeed />}
        </SafeAreaView>
      </Animated.ScrollView>
    </SafeAreaView>
  )
}

export default ExchangeHomeScreen

const styles = StyleSheet.create({
  contentContainer: {
    flexGrow: 1,
    paddingBottom: variables.contentPadding,
  },
  header: {
    alignItems: 'center',
  },
  background: {
    flex: 1,
    justifyContent: 'space-between',
  },
  goldPrice: {
    padding: variables.contentPadding,
  },
  goldPriceTitleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  goldPriceTitle: {
    ...fontStyles.h2,
    marginRight: 8,
  },
  goldPriceValues: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  goldPriceCurrentValue: {
    minHeight: 27,
    ...fontStyles.mediumNumber,
  },
  goldPriceCurrentValueHeader: {
    ...fontStyles.regular500,
  },
  goldPriceWentUp: {
    ...fontStyles.regular,
    color: colors.greenUI,
  },
  goldPriceWentDown: {
    ...fontStyles.regular,
    marginLeft: 4,
    color: colors.warning,
  },
  goldPriceWentUpHeader: {
    ...fontStyles.small600,
    color: colors.greenBrand,
  },
  goldPriceWentDownHeader: {
    ...fontStyles.small600,
    color: colors.warning,
  },
})
