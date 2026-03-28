const fs = require('fs');

// Generate a full year of 15-minute weather data
const startDate = new Date('2026-01-01T00:00:00Z');
const endDate = new Date('2026-12-31T23:45:00Z');
const rows = [];
rows.push('Timestamp,Temperature,Pressure,Humidity,WindSpeed,Rainfall,SolarRadiation');

let currentDate = new Date(startDate);
let totalRows = 0;

while (currentDate <= endDate) {
  const timestamp = Math.floor(currentDate.getTime() / 1000);
  
  const hour = currentDate.getUTCHours();
  const month = currentDate.getUTCMonth();
  const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / 86400000);
  
  // 1. Temperature (seasonal + daily cycle + noise)
  const seasonalTrend = 10 + Math.sin((dayOfYear - 100) * 2 * Math.PI / 365) * 15;
  const dailyCycle = Math.sin((hour - 6) * Math.PI / 12) * 5;
  const temperature = (seasonalTrend + dailyCycle + (Math.random() - 0.5) * 2).toFixed(2);
  
  // 2. Pressure (atmospheric variations)
  const pressure = (1013 + Math.sin(dayOfYear / 10) * 15 + (Math.random() - 0.5) * 4).toFixed(1);
  
  // 3. Humidity (inverse to temperature + seasonal)
  const humidityTrend = 60 + Math.cos((dayOfYear - 10) * 2 * Math.PI / 365) * 20;
  const humidityDaily = -Math.sin((hour - 6) * Math.PI / 12) * 15;
  const humidity = Math.min(100, Math.max(10, humidityTrend + humidityDaily + Math.random() * 10)).toFixed(1);
  
  // 4. Wind Speed (random bursts + daily pattern)
  const windBase = 5 + Math.random() * 10;
  const windBurst = Math.random() > 0.95 ? Math.random() * 30 : 0;
  const windSpeed = (windBase + windBurst + Math.sin(hour * Math.PI / 24) * 3).toFixed(1);
  
  // 5. Rainfall (occasional rain events)
  let rainfall = 0;
  if (Math.random() > 0.98) {
    rainfall = (Math.random() * 5).toFixed(2);
  }
  
  // 6. Solar Radiation (only during day, depends on month)
  let solar = 0;
  if (hour > 6 && hour < 18) {
    const sunHeight = Math.sin((hour - 6) * Math.PI / 12);
    const monthFactor = 0.5 + Math.sin(month * Math.PI / 12) * 0.5;
    solar = (sunHeight * monthFactor * 1000 + Math.random() * 50).toFixed(0);
  }

  rows.push(`${timestamp},${temperature},${pressure},${humidity},${windSpeed},${rainfall},${solar}`);
  totalRows++;
  
  // Advance by 15 minutes
  currentDate.setUTCMinutes(currentDate.getUTCMinutes() + 15);
}

fs.writeFileSync('sample-weather-data.csv', rows.join('\n'));
console.log(`Successfully generated sample-weather-data.csv with ${totalRows} rows and 7 columns.`);
console.log(`File contains data from ${startDate.toISOString()} to ${endDate.toISOString()} (15-min resolution).`);
