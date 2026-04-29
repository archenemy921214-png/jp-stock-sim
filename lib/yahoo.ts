import YahooFinance from 'yahoo-finance2'

// v3から new YahooFinance() によるインスタンス化が必要
export const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
