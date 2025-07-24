import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { TrendingUp, TrendingDown, Home, PoundSterling, Users, BarChart3, CalendarDays } from 'lucide-react'
import { format, subMonths, subYears } from 'date-fns'
import Papa from 'papaparse'
import SmartChart from '@/components/SmartChart'
import './App.css'

// Type definitions
interface RegionData {
  affordability: number
  trend: string
  lastUpdated: string
  gilts: { value: number; change: number; trend: string }
  housePrice: { value: number; change: number; trend: string }
  income: { value: number; change: number; trend: string }
}

interface ChartDataPoint {
  date: string
  [key: string]: string | number
}

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

function App() {
  const [selectedRegion, setSelectedRegion] = useState<string>('England')
  const [affordabilityData, setAffordabilityData] = useState<Record<string, RegionData>>({})
  const [giltsData, setGiltsData] = useState<ChartDataPoint[]>([])
  const [housePriceData, setHousePriceData] = useState<ChartDataPoint[]>([])
  const [incomeData, setIncomeData] = useState<ChartDataPoint[]>([])
  const [affordabilityTrendData, setAffordabilityTrendData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  
  // Global date range state
  const [globalDateRange, setGlobalDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  })
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [isMobileDatePickerOpen, setIsMobileDatePickerOpen] = useState(false)

  // Get the latest date from affordability data
  const latestDataDate = useMemo(() => {
    if (affordabilityTrendData.length === 0) return new Date()
    
    // Parse all dates and find the latest one
    const dates = affordabilityTrendData
      .map(point => {
        try {
          return new Date(point.date)
        } catch {
          return null
        }
      })
      .filter(date => date !== null)
      .sort((a, b) => b!.getTime() - a!.getTime())
    
    return dates.length > 0 ? dates[0]! : new Date()
  }, [affordabilityTrendData])

  // Get shorter display text for mobile
  const getShortDateRangeText = useCallback(() => {
    if (globalDateRange.from && globalDateRange.to) {
      // Check if it's a preset range by comparing dates
      const now = latestDataDate
      if (globalDateRange.from.getTime() === subMonths(now, 6).getTime()) return "6M"
      if (globalDateRange.from.getTime() === subYears(now, 1).getTime()) return "1Y" 
      if (globalDateRange.from.getTime() === subYears(now, 2).getTime()) return "2Y"
      if (globalDateRange.from.getTime() === subYears(now, 5).getTime()) return "5Y"
      
      // For custom ranges, use short format
      return `${format(globalDateRange.from, 'MMM yy')} - ${format(globalDateRange.to, 'MMM yy')}`
    }
    if (globalDateRange.from) {
      return `From ${format(globalDateRange.from, 'MMM yy')}`
    }
    return "All Time"
  }, [globalDateRange, latestDataDate])

  // Quick date range presets
  const handleQuickRange = useCallback((range: string) => {
    const referenceDate = latestDataDate
    switch (range) {
      case '6M':
        setGlobalDateRange({ from: subMonths(referenceDate, 6), to: referenceDate })
        break
      case '1Y':
        setGlobalDateRange({ from: subYears(referenceDate, 1), to: referenceDate })
        break
      case '2Y':
        setGlobalDateRange({ from: subYears(referenceDate, 2), to: referenceDate })
        break
      case '5Y':
        setGlobalDateRange({ from: subYears(referenceDate, 5), to: referenceDate })
        break
      case 'ALL':
        setGlobalDateRange({ from: undefined, to: undefined })
        break
    }
    setIsDatePickerOpen(false)
    setIsMobileDatePickerOpen(false)
  }, [latestDataDate])

  // Data fetching functions
  const fetchJsonData = useCallback(async (url: string) => {
    const response = await fetch(url)
    return response.json()
  }, [])

  const fetchCsvData = useCallback(async (url: string): Promise<ChartDataPoint[]> => {
    const response = await fetch(url)
    const csvText = await response.text()
    
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as ChartDataPoint[]
          // Convert date strings to ISO format and ensure numeric values
          const processedData = data.map(row => {
            const processed: ChartDataPoint = { date: row.date }
            Object.keys(row).forEach(key => {
              if (key !== 'date') {
                processed[key] = parseFloat(row[key] as string) || 0
              }
            })
            // Keep date in YYYY-MM-DD format for SmartChart processing
            if (row.date) {
              try {
                const date = new Date(row.date as string)
                processed.date = date.toISOString().split('T')[0]
              } catch {
                processed.date = row.date // Keep original if parsing fails
              }
            }
            return processed
          })
          
          resolve(processedData)
        }
      })
    })
  }, [])

  // Load all data on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        const [affordability, gilts, housePrices, incomes, affordabilityTrend] = await Promise.all([
          fetchJsonData('/affordability-data.json'),
          fetchCsvData('/gilts-data.csv'),
          fetchCsvData('/house-prices-data.csv'),
          fetchCsvData('/income-data.csv'),
          fetchCsvData('/affordability-trend.csv')
        ])

        setAffordabilityData(affordability)
        setGiltsData(gilts)
        setHousePriceData(housePrices)
        setIncomeData(incomes)
        setAffordabilityTrendData(affordabilityTrend)
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [fetchJsonData, fetchCsvData])

  // Memoize current data calculation
  const currentData = useMemo(() => {
    return affordabilityData[selectedRegion] || {
      affordability: 0,
      trend: 'up',
      lastUpdated: '',
      gilts: { value: 0, change: 0, trend: 'up' },
      housePrice: { value: 0, change: 0, trend: 'up' },
      income: { value: 0, change: 0, trend: 'up' }
    }
  }, [affordabilityData, selectedRegion])

  // Memoize formatters to prevent recreation on each render
  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }, [])

  const formatNumber = useCallback((value: number, decimals = 1) => {
    return new Intl.NumberFormat('en-GB', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value)
  }, [])

  const getTrendIcon = useCallback((trend: string) => {
    return trend === 'up' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />
  }, [])

  const getTrendColor = useCallback((trend: string) => {
    return trend === 'up' ? 'text-red-600' : 'text-green-600'
  }, [])

  // Memoize tooltip formatters
  const currencyFormatter = useCallback((value: any): [string, string] => [formatCurrency(value as number), 'Price'], [formatCurrency])
  const incomeFormatter = useCallback((value: any): [string, string] => [formatCurrency(value as number), 'Income'], [formatCurrency])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading affordability data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">UK Housing Affordability</h1>
              <p className="text-gray-600 mt-1">Live indicators of house price affordability</p>
            </div>
            
            <div className="flex items-center gap-4">
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(affordabilityData).map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            </div>
          </div>

          {/* Global Date Range Picker - Desktop */}
          <div className="hidden md:flex items-center justify-center gap-4 p-4 bg-white rounded-lg border shadow-sm">
            <div className="text-sm font-medium text-gray-700">
              Date Range (applies to all charts):
            </div>
            
            {/* Quick range buttons */}
            <div className="flex gap-2">
              {['6M', '1Y', '2Y', '5Y', 'ALL'].map((range) => (
                <Button
                  key={range}
                  variant={
                    (range === '6M' && globalDateRange.from && subMonths(latestDataDate, 6).getTime() === globalDateRange.from.getTime()) ||
                    (range === '1Y' && globalDateRange.from && subYears(latestDataDate, 1).getTime() === globalDateRange.from.getTime()) ||
                    (range === '2Y' && globalDateRange.from && subYears(latestDataDate, 2).getTime() === globalDateRange.from.getTime()) ||
                    (range === '5Y' && globalDateRange.from && subYears(latestDataDate, 5).getTime() === globalDateRange.from.getTime()) ||
                    (range === 'ALL' && !globalDateRange.from && !globalDateRange.to)
                      ? "default" : "outline"
                  }
                  size="sm"
                  className="h-8 px-3 text-sm"
                  onClick={() => handleQuickRange(range)}
                >
                  {range}
                </Button>
              ))}
            </div>
            
            {/* Custom date picker */}
            <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-3">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  {globalDateRange.from && globalDateRange.to 
                    ? `${format(globalDateRange.from, 'MMM dd, yyyy')} - ${format(globalDateRange.to, 'MMM dd, yyyy')}`
                    : globalDateRange.from
                    ? `From ${format(globalDateRange.from, 'MMM dd, yyyy')}`
                    : "Custom Range"
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <CalendarComponent
                  mode="range"
                  selected={{
                    from: globalDateRange.from,
                    to: globalDateRange.to
                  }}
                  onSelect={(range: any) => {
                    setGlobalDateRange(range || { from: undefined, to: undefined })
                  }}
                  numberOfMonths={2}
                />
                <div className="p-2 border-t">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full"
                    onClick={() => {
                      setGlobalDateRange({ from: undefined, to: undefined })
                      setIsDatePickerOpen(false)
                    }}
                  >
                    Clear dates
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Global Date Range Picker - Mobile */}
          <div className="md:hidden">
            <Button
              variant="outline"
              className="w-full p-3 h-auto flex items-center justify-between text-left"
              onClick={() => setIsMobileDatePickerOpen(!isMobileDatePickerOpen)}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <CalendarDays className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium flex-shrink-0">Range:</span>
                <span className="text-sm text-gray-600 truncate">{getShortDateRangeText()}</span>
              </div>
              <div className={`transform transition-transform flex-shrink-0 ml-2 ${isMobileDatePickerOpen ? 'rotate-180' : ''}`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </Button>
            
            {/* Mobile Date Picker Card */}
            {isMobileDatePickerOpen && (
              <Card className="mt-2 shadow-lg">
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <div className="text-sm font-medium text-gray-700">
                      Select date range (applies to all charts):
                    </div>
                    
                    {/* Quick range buttons - mobile layout */}
                    <div className="grid grid-cols-3 gap-2">
                      {['6M', '1Y', '2Y', '5Y', 'ALL'].map((range) => (
                        <Button
                          key={range}
                          variant={
                            (range === '6M' && globalDateRange.from && subMonths(latestDataDate, 6).getTime() === globalDateRange.from.getTime()) ||
                            (range === '1Y' && globalDateRange.from && subYears(latestDataDate, 1).getTime() === globalDateRange.from.getTime()) ||
                            (range === '2Y' && globalDateRange.from && subYears(latestDataDate, 2).getTime() === globalDateRange.from.getTime()) ||
                            (range === '5Y' && globalDateRange.from && subYears(latestDataDate, 5).getTime() === globalDateRange.from.getTime()) ||
                            (range === 'ALL' && !globalDateRange.from && !globalDateRange.to)
                              ? "default" : "outline"
                          }
                          size="sm"
                          className="h-10"
                          onClick={() => handleQuickRange(range)}
                        >
                          {range}
                        </Button>
                      ))}
                    </div>
                    
                    {/* Custom date picker - mobile */}
                    <div className="border-t pt-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">
                        Or select custom range:
                      </div>
                      <CalendarComponent
                        mode="range"
                        selected={{
                          from: globalDateRange.from,
                          to: globalDateRange.to
                        }}
                        onSelect={(range: any) => {
                          setGlobalDateRange(range || { from: undefined, to: undefined })
                        }}
                        numberOfMonths={1}
                        className="w-full"
                      />
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full mt-2"
                        onClick={() => {
                          setGlobalDateRange({ from: undefined, to: undefined })
                        }}
                      >
                        Clear dates
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Main Affordability Metric */}
        <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-medium text-blue-100">
              House Price to Income Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="text-5xl font-bold">
                {formatNumber(currentData.affordability)}×
              </div>
              <div className={`flex items-center gap-1 mb-2 ${getTrendColor(currentData.trend)}`}>
                {getTrendIcon(currentData.trend)}
                <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                  {currentData.trend === 'up' ? 'Less Affordable' : 'More Affordable'}
                </Badge>
              </div>
            </div>
            <p className="text-blue-100 mt-2">
              Higher ratios indicate less affordable housing relative to incomes
            </p>
            
            {/* Affordability trend chart */}
            <div className="mt-4">
              <SmartChart
                data={affordabilityTrendData}
                dataKey={selectedRegion}
                stroke="#ffffff"
                height={128}
                strokeWidth={2}
                showDots={true}
                title="Affordability History"
                dateRange={globalDateRange}
                customTooltipStyle={{
                  backgroundColor: 'rgba(0,0,0,0.8)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white'
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Driver Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Gilts Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">10-Year Gilt Yields</CardTitle>
              <PoundSterling className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-4">
                <div className="text-3xl font-bold">{formatNumber(currentData.gilts.value)}%</div>
                <div className={`flex items-center gap-1 mb-1 text-sm ${getTrendColor(currentData.gilts.trend)}`}>
                  {getTrendIcon(currentData.gilts.trend)}
                  <span>+{formatNumber(currentData.gilts.change)}%</span>
                </div>
              </div>
              
              {/* Gilts trend chart */}
              <SmartChart
                data={giltsData}
                dataKey="yield"
                stroke="#3b82f6"
                height={96}
                dateRange={globalDateRange}
              />
              
              <CardDescription className="mt-3">
                Proxy for mortgage rates. Higher yields typically lead to higher mortgage costs.
              </CardDescription>
            </CardContent>
          </Card>

          {/* House Price Index Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Average House Price</CardTitle>
              <Home className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-4">
                <div className="text-3xl font-bold">{formatCurrency(currentData.housePrice.value)}</div>
                <div className={`flex items-center gap-1 mb-1 text-sm ${getTrendColor(currentData.housePrice.trend)}`}>
                  {getTrendIcon(currentData.housePrice.trend)}
                  <span>+{formatNumber(currentData.housePrice.change)}%</span>
                </div>
              </div>
              
              {/* House price trend chart */}
              <SmartChart
                data={housePriceData}
                dataKey={selectedRegion}
                stroke="#10b981"
                height={96}
                dateRange={globalDateRange}
                formatter={currencyFormatter}
              />
              
              <CardDescription className="mt-3">
                Land Registry house price index. Shows the cost side of the affordability equation.
              </CardDescription>
            </CardContent>
          </Card>

          {/* Income Card */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Median Income</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 mb-4">
                <div className="text-3xl font-bold">{formatCurrency(currentData.income.value)}</div>
                <div className={`flex items-center gap-1 mb-1 text-sm ${getTrendColor(currentData.income.trend)}`}>
                  {getTrendIcon(currentData.income.trend)}
                  <span>+{formatNumber(currentData.income.change)}%</span>
                </div>
              </div>
              
              {/* Income trend chart */}
              <SmartChart
                data={incomeData}
                dataKey={selectedRegion}
                stroke="#f59e0b"
                height={96}
                dateRange={globalDateRange}
                formatter={incomeFormatter}
              />
              
              <CardDescription className="mt-3">
                Median household income. Higher incomes improve affordability relative to house prices.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-8">
          <p>Data sourced from Land Registry, ONS, and Bank of England • Last updated: {currentData.lastUpdated ? new Date(currentData.lastUpdated).toLocaleString() : 'Unknown'}</p>
        </div>
      </div>
    </div>
  )
}

export default App
