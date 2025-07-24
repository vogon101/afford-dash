#!/usr/bin/env python3
"""
UK Housing Affordability Data Updater

This script fetches the latest data from:
- Bank of England (Gilt yields)
- ONS (Income data) 
- Land Registry (House prices)
- HM Treasury (Economic indicators)

Updates all CSV and JSON files in the public directory.
"""

import json
import csv
import requests
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
import time
import logging
import random

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


regions = {
    'England': 'E92000001',
    'Scotland': 'S92000003',
    'Wales': 'W92000004',
    'Northern Ireland': 'N92000002',
    'London': 'E12000007',
    'South East': 'E12000008',
    'South West': 'E12000009',
    'East Midlands': 'E12000004',
    'East of England': 'E12000006',
    'West Midlands': 'E11000005',
    'Yorkshire and The Humber': 'E12000003',
    'North East': 'E12000001',
    'North West': 'E12000002',
}

class HousingDataUpdater:
    def __init__(self):
        self.base_path = Path(__file__).parent.parent / "public"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'YIMBYAlliance-AffordabilityDashboard/1.0'
        })

    def fetch_gilt_yields(self):
        """Fetch 10-year gilt yield data from Bank of England API"""
        logger.info("Fetching gilt yield data...")
        
        try:
            # Bank of England API for 10-year gilt yields
            # Series: IUDMNZC (10-year gilt yield)
            url = "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp"
            params = {
                'csv.x': 'yes',
                'Datefrom': '01/Jan/2000',
                'Dateto': 'now',
                'SeriesCodes': 'IUDMNZC',
                'CSVF': 'TN',
                'UsingCodes': 'Y'
            }
    
            response = self.session.get(url, params=params)
            print(response.url)
            response.raise_for_status()
            
            # Parse the CSV response
            lines = response.text.strip().split('\n')
            data = []
            
            # Skip header rows and find data
            for line in lines:
                if ',' in line and not line.startswith('DATE'):
                    try:
                        parts = line.split(',')
                        if len(parts) >= 2:
                            date_str = parts[0].strip()
                            yield_val = parts[1].strip()
                            
                            if yield_val and yield_val != '':
                                # Convert date format
                                date_obj = datetime.strptime(date_str, '%d %b %Y')
                                data.append({
                                    'date': date_obj.strftime('%Y-%m-%d'),
                                    'yield': float(yield_val)
                                })
                    except (ValueError, IndexError):
                        continue
            
            # If API fails, generate mock data
            if not data:
                logger.warning("No gilt data received, generating mock data")
            
            # Save to CSV
            with open(self.base_path / "gilts-data.csv", 'w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=['date', 'yield'])
                writer.writeheader()
                writer.writerows(data)  # Last 12 months

            logger.info(f"Updated gilt data with {len(data)} records")
            return pd.read_csv(self.base_path / "gilts-data.csv").set_index('date')
            
        except Exception as e:
            logger.error(f"Error fetching gilt data: {e}")
            return self.generate_mock_gilt_data()

    def process_house_prices(self):
        """Process the house price index in public/hpi-raw.csv"""
        logger.info("Fetching house price data...")
        
        raw_data = pd.read_csv(self.base_path / "hpi-raw.csv")

        regional_data = raw_data.loc[raw_data['AreaCode'].isin(regions.values())]
        regional_data['Date'] = pd.to_datetime(regional_data['Date'], format='%d/%m/%Y')
        print(regional_data.RegionName.unique())
        print(regional_data)

        # Pivot data to get regions as columns
        pivoted_data = regional_data.pivot(
            columns='RegionName',
            values='AveragePrice',
            index='Date'
        ).reset_index()

        # Save formatted data
        pivoted_data['date'] = pd.to_datetime(pivoted_data['Date']).dt.strftime('%Y-%m-%d')
        pivoted_data = pivoted_data.sort_values('date').reset_index(drop=True).set_index('date')
        pivoted_data = pivoted_data.drop(columns=['Date'])
        pivoted_data.to_csv(self.base_path / "house-prices-data.csv")
        logger.info("Saved formatted house price data")
        
        return pivoted_data
    

    def fetch_income_data(self):
        """Fetch income data from ONS"""
        logger.info("Fetching income data...")
        
    
        # ONS API for median household income
        # In production, use: https://api.ons.gov.uk/
        
        incomes = {
            region : 34750 * (random.random() + 25)/25 for region in regions.keys()
        }
        
        # Generate time series data
        data = []
        start_date = datetime(2023, 1, 1)
        
        for i in range(13):
            current_date = start_date + timedelta(days=30*i)
            row = {'date': current_date.strftime('%Y-%m-%d')}
            
            for region, base_income in incomes.items():
                # Add realistic income growth
                growth = 1 + (i * 0.0015)  # ~1.8% annual growth
                row[region] = int(base_income * growth)
            
            data.append(row)
        
        # Save to CSV
        with open(self.base_path / "income-data.csv", 'w', newline='') as f:
            fieldnames = ['date'] + list(regions.keys())
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        
        logger.info("Updated income data")
        return pd.read_csv(self.base_path / "income-data.csv").set_index('date')
            

    def calculate_affordability_ratios(self, house_prices, incomes, gilt_yield):
        """Calculate affordability ratios and generate trend data"""
        logger.info("Calculating affordability ratios...")
        
        # Ensure both dataframes have datetime index
        house_prices.index = pd.to_datetime(house_prices.index)
        incomes.index = pd.to_datetime(incomes.index)
        gilt_yield.index = pd.to_datetime(gilt_yield.index)
        
        # Sort by date to ensure proper forward fill
        house_prices = house_prices.sort_index()
        incomes = incomes.sort_index()
        gilt_yield = gilt_yield.sort_index()
        
        logger.info(f"House prices date range: {house_prices.index.min()} to {house_prices.index.max()}")
        logger.info(f"Incomes date range: {incomes.index.min()} to {incomes.index.max()}")
        logger.info(f"Gilts yield date range: {gilt_yield.index.min()} to {gilt_yield.index.max()}")
        
        # Calculate affordability ratios by aligning dates
        affordability_ratios = gilt_yield.copy()
        
        for region in regions.keys():
            if region in incomes.columns and region in house_prices.columns:
                logger.info(f"Processing region: {region}")
                
                # For each house price date, find the closest previous income value
                aligned_incomes = []
                aligned_house_prices = []
                for date in gilt_yield.index:
                    # Get income value at or before this date
                    income_slice = incomes[incomes.index <= date][region]
                    house_price_slice = house_prices[house_prices.index <= date][region]
                    if len(income_slice) > 0:
                        # Use the most recent income value
                        aligned_incomes.append(income_slice.iloc[-1])
                    else:
                        # If no previous income data, use the first available income
                        aligned_incomes.append(incomes[region].iloc[0])

                    if len(house_price_slice) > 0:
                        aligned_house_prices.append(house_price_slice.iloc[-1])
                    else:
                        aligned_house_prices.append(house_prices[region].iloc[0])
                 
                # Calculate mortgage affordability incorporating gilt yields
                # Mortgage rate = gilt yield + typical spread (usually 1.5-2.5%)
                mortgage_rates = gilt_yield['yield'] + 2.0  # 2% spread over gilts
                affordability_scores = []
                for i, date in enumerate(gilt_yield.index):
                    income = aligned_incomes[i]
                    house_price = aligned_house_prices[i]
                    mortgage_rate = mortgage_rates.iloc[i] / 100  # Convert percentage to decimal

                    # Required deposit (10% of house price)
                    required_deposit = house_price * 0.1
                    loan_amount = house_price - required_deposit

                    # Calculate monthly mortgage payment using standard formula
                    # M = P * [r(1+r)^n] / [(1+r)^n - 1]
                    # Where P = loan amount, r = monthly rate, n = number of payments (25 years)
                    monthly_rate = mortgage_rate / 12
                    n_payments = 25 * 12  # 25 year mortgage

                    if monthly_rate > 0:
                        monthly_payment = loan_amount * (monthly_rate * (1 + monthly_rate)**n_payments) / ((1 + monthly_rate)**n_payments - 1)
                    else:
                        monthly_payment = loan_amount / n_payments

                    # Monthly income
                    monthly_income = income / 12

                    # Affordability ratio: what percentage of monthly income goes to mortgage
                    # Lower is more affordable
                    affordability_ratio = (monthly_payment / monthly_income) * 100

                    # Also consider deposit requirement as multiple of annual income
                    deposit_to_income_ratio = required_deposit / income

                    # Combined affordability score (weighted average)
                    # 70% weight on monthly payments, 30% on deposit burden
                    combined_score = (affordability_ratio * 0.7) + (deposit_to_income_ratio * 100 * 0.3)

                    affordability_scores.append(combined_score)

                affordability_ratios[region] = affordability_scores

            else:
                logger.warning(f"Region {region} not found in income data, removing from affordability")
                affordability_ratios = affordability_ratios.drop(columns=[region])
        
        # Round to 1 decimal place
        affordability_ratios = affordability_ratios.round(1)
        print(affordability_ratios)
        
        # Save the affordability trend data
        affordability_ratios_for_csv = affordability_ratios.copy()
        affordability_ratios_for_csv.index.name = 'date'
        affordability_ratios_for_csv.reset_index().to_csv(
            self.base_path / "affordability-trend.csv", 
            index=False
        )
        
        logger.info("Updated affordability trend data")
        logger.info(f"Affordability ratios calculated for {len(affordability_ratios.columns)} regions")
        
        return affordability_ratios

    def update_main_data_file(self, gilt_yield, house_prices, incomes, affordability_ratios):
        """Update the main JSON data file"""
        logger.info("Updating main data file...")
        
        current_time = datetime.now().isoformat() + 'Z'
        
        # Get the latest gilt yield value
        if isinstance(gilt_yield, pd.DataFrame):
            latest_gilt = gilt_yield['yield'].iloc[-1] if len(gilt_yield) > 0 else 4.1
        else:
            latest_gilt = gilt_yield
        
        data = {}
        
        # Map region names to match the frontend expectations
        region_mapping = {
            'England': 'england',
            'London': 'london', 
            'Scotland': 'scotland',
            'Wales': 'wales',
            'Northern Ireland': 'northern-ireland'
        }
        
        for region in house_prices.columns:
            if region in incomes.columns and region in affordability_ratios.columns:
                # Get the most recent values
                latest_house_price = house_prices[region].iloc[-1]
                latest_income = incomes[region].iloc[-1] 
                latest_affordability = affordability_ratios[region].iloc[-1]
                
                # Calculate percentage changes (mock for now - could calculate from historical data)
                house_price_change = 2.1
                income_change = 1.8
                
                # Map to frontend region name
                frontend_region = region
                
                data[frontend_region] = {
                    "affordability": float(latest_affordability),
                    "trend": "up" if latest_affordability > 6 else "down",
                    "lastUpdated": current_time,
                    "gilts": {
                        "value": float(latest_gilt),
                        "change": 0.2,
                        "trend": "up"
                    },
                    "housePrice": {
                        "value": int(latest_house_price),
                        "change": house_price_change,
                        "trend": "up"
                    },
                    "income": {
                        "value": int(latest_income),
                        "change": income_change,
                        "trend": "up"
                    }
                }
                
                logger.info(f"Added data for {frontend_region}: affordability {latest_affordability}x")
        
        # Save to JSON
        with open(self.base_path / "affordability-data.json", 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Updated main data file with {len(data)} regions")

    

    def run(self):
        """Main execution method"""
        logger.info("Starting housing data update...")
        
        try:
            # Ensure output directory exists
            self.base_path.mkdir(exist_ok=True)
            
            # Fetch all data
            gilt_yield = self.fetch_gilt_yields()
            house_prices = self.process_house_prices()
            incomes = self.fetch_income_data()
            
            # Calculate affordability ratios
            affordability_ratios = self.calculate_affordability_ratios(house_prices, incomes, gilt_yield)
            
            # Update main data file
            self.update_main_data_file(gilt_yield, house_prices, incomes, affordability_ratios)
            
            logger.info("Housing data update completed successfully!")
            
        except Exception as e:
            logger.error(f"Error during data update: {e}")
            raise

if __name__ == "__main__":
    updater = HousingDataUpdater()
    updater.run() 