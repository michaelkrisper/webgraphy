const fs = require('fs');

const startDate = new Date('2026-01-01T00:00:00Z');
const endDate = new Date('2026-03-28T00:00:00Z');
const rows = [];
rows.push('Timestamp,Temperature,Pressure');

let currentDate = new Date(startDate);
while (currentDate <= endDate) {
  const timestamp = Math.floor(currentDate.getTime() / 1000);
  
  // Simulate temperature with daily and seasonal cycles
  const hour = currentDate.getUTCHours();
  const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / 86400000);
  
  // Seasonal trend (colder in winter, warmer in spring)
  const seasonalTrend = -5 + (dayOfYear / 90) * 15;
  // Daily cycle (warmer in the afternoon)
  const dailyCycle = Math.sin((hour - 6) * Math.PI / 12) * 5;
  // Random noise
  const noise = (Math.random() - 0.5) * 2;
  
  const temperature = (seasonalTrend + dailyCycle + noise).toFixed(2);
  
  // Simulate pressure (around 1013 hPa)
  const pressure = (1013 + Math.sin(dayOfYear / 5) * 10 + (Math.random() - 0.5) * 5).toFixed(1);
  
  rows.push(`${timestamp},${temperature},${pressure}`);
  
  // Advance by 1 hour
  currentDate.setUTCHours(currentDate.getUTCHours() + 1);
}

fs.writeFileSync('sample-weather-data.csv', rows.join('\n'));
console.log('Successfully generated sample-weather-data.csv with ' + (rows.length - 1) + ' rows.');
