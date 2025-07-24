import React, { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO, isAfter, isBefore } from 'date-fns'

interface ChartDataPoint {
  date: string
  [key: string]: string | number
}

interface SmartChartProps {
  data: ChartDataPoint[]
  dataKey: string
  stroke: string
  title?: string
  formatter?: (value: any) => [string, string]
  height?: number
  strokeWidth?: number
  showDots?: boolean
  customTooltipStyle?: React.CSSProperties
  dateRange?: {
    from: Date | undefined
    to: Date | undefined
  }
}

// Smart data resolution logic with minimum 3-month resolution
const getOptimalResolution = (dataPoints: number, dateRange: { from: Date; to: Date }) => {
  const daysDiff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))
  
  if (dataPoints > 300) {
    if (daysDiff > 365 * 3) return 'monthly'
    if (daysDiff > 365 * 2) return 'biweekly'
    if (daysDiff > 365) return 'weekly'
    return 'daily'
  }
  
  // Less than 200 points, still minimum quarterly
  return 'daily'
}

const resampleData = (data: ChartDataPoint[], resolution: string): ChartDataPoint[] => {
  if (data.length === 0) return data
  
  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  // Group data by time periods based on resolution
  const groups = new Map<string, ChartDataPoint[]>()
  
  sorted.forEach(point => {
    const date = new Date(point.date)
    let groupKey: string
    
    switch (resolution) {
      case 'weekly':
        // Group by week (Monday as start of week)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay() + 1)
        groupKey = weekStart.toISOString().split('T')[0]
        break
        
      case 'biweekly':
        // Group by 2-week periods
        const biweekStart = new Date(date)
        const daysSinceEpoch = Math.floor(date.getTime() / (1000 * 60 * 60 * 24))
        const biweekNumber = Math.floor(daysSinceEpoch / 14)
        groupKey = `biweek-${biweekNumber}`
        break
        
      case 'monthly':
        // Group by month
        groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        break
        
      case 'quarterly':
        // Group by quarter
        const quarter = Math.floor(date.getMonth() / 3) + 1
        groupKey = `${date.getFullYear()}-Q${quarter}`
        break
        
      default:
        // Default to daily
        groupKey = date.toISOString().split('T')[0]
    }
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
    }
    groups.get(groupKey)!.push(point)
  })
  
  // Take the most recent point from each group
  const result: ChartDataPoint[] = []
  groups.forEach(groupPoints => {
    // Sort points in the group by date and take the most recent
    const sortedGroup = groupPoints.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    result.push(sortedGroup[0]) // Most recent point in the group
  })
  
  // Sort final result by date
  return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

const SmartChart: React.FC<SmartChartProps> = ({
  data,
  dataKey,
  stroke,
  title,
  formatter,
  height = 96,
  strokeWidth = 2,
  showDots = false,
  customTooltipStyle,
  dateRange
}) => {
  // Filter and intelligently resample data
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return []

    // Parse dates and sort
    const parsedData = data.map(point => ({
      ...point,
      parsedDate: parseISO(point.date)
    })).sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime())

    // Apply date range filter
    let filteredData = parsedData
    if (dateRange?.from || dateRange?.to) {
      filteredData = parsedData.filter(point => {
        if (dateRange.from && isBefore(point.parsedDate, dateRange.from)) return false
        if (dateRange.to && isAfter(point.parsedDate, dateRange.to)) return false
        return true
      })
    }

    if (filteredData.length === 0) return []

    // Determine optimal resolution
    const resolution = getOptimalResolution(filteredData.length, {
      from: dateRange?.from || filteredData[0].parsedDate,
      to: dateRange?.to || filteredData[filteredData.length - 1].parsedDate
    })

    // Remove the parsedDate before resampling
    const cleanData = filteredData.map(({ parsedDate, ...rest }) => rest)
    
    // Resample data based on resolution
    const resampledData = resampleData(cleanData, resolution)

    console.log(`Resampling data with ${resolution} resolution`)

    // Format dates for display
    return resampledData.map(point => ({
      ...point,
      date: format(parseISO(point.date), 'yyyy-MM-dd')
    }))
  }, [data, dateRange])

  return (
    <div className="w-full">
      {/* Optional title with data point count */}
      {title && (
        <div className="text-sm font-medium text-gray-700 mb-2">
          {title}
          <span className="ml-2 text-xs text-gray-500">
            ({processedData.length} points)
          </span>
        </div>
      )}

      {/* Chart */}
      <div style={{ height: `${height}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={processedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              hide={height < 150}
              tick={{ fontSize: 10 }}
            />
            <YAxis 
              hide={height < 150}
              tick={{ fontSize: 10 }}
            />
            <Tooltip 
              formatter={formatter}
              contentStyle={customTooltipStyle || {
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '12px'
              }}
            />
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={stroke} 
              strokeWidth={strokeWidth}
              dot={showDots ? { r: 2 } : false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Resolution indicator */}
      {processedData.length > 0 && processedData.length < data.length && (
        <div className="mt-1 text-xs text-gray-400 text-center">
          <span>Showing {processedData.length} of {data.length} points</span>
        </div>
      )}
    </div>
  )
}

export default SmartChart 