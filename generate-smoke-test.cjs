const fs = require('fs');

// Generate a full year of 30-second weather data (~1 million rows)
const startDate = new Date('2026-01-01T00:00:00Z');
const endDate = new Date('2026-12-31T23:59:30Z');
const rows = [];
rows.push('Timestamp,Temperature,Pressure,Humidity,WindSpeed,Rainfall,SolarRadiation,Noise1,Noise2,Noise3');

console.log('Generating smoke test data (~50MB)...');

let currentDate = new Date(startDate);
let totalRows = 0;

// To handle memory efficiently for 1M rows, we'll write in chunks
const stream = fs.createWriteStream('smoke-test-data.csv');
stream.write(rows[0] + '\n');

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
  
  // 4. Wind Speed
  const windBase = 5 + Math.random() * 10;
  const windBurst = Math.random() > 0.999 ? Math.random() * 30 : 0;
  const windSpeed = (windBase + windBurst + Math.sin(hour * Math.PI / 24) * 3).toFixed(1);
  
  // 5. Rainfall
  let rainfall = 0;
  if (Math.random() > 0.9995) rainfall = (Math.random() * 5).toFixed(2);
  
  // 6. Solar Radiation
  let solar = 0;
  if (hour > 6 && hour < 18) {
    const sunHeight = Math.sin((hour - 6) * Math.PI / 12);
    const monthFactor = 0.5 + Math.sin(month * Math.PI / 12) * 0.5;
    solar = (sunHeight * monthFactor * 1000 + Math.random() * 50).toFixed(0);
  }

  // Add some random noise columns to increase file size
  const n1 = (Math.random() * 100).toFixed(3);
  const n2 = (Math.random() * 1000).toFixed(3);
  const n3 = (Math.random() - 0.5).toFixed(5);

  const row = `${timestamp},${temperature},${pressure},${humidity},${windSpeed},${rainfall},${solar},${n1},${n2},${n3}\n`;
  stream.write(row);
  totalRows++;
  
  // Advance by 30 seconds
  currentDate.setUTCSeconds(currentDate.getUTCSeconds() + 30);

  if (totalRows % 100000 === 0) {
    console.log(`Progress: ${totalRows} rows generated...`);
  }
}

stream.end();
stream.on('finish', () => {
  const stats = fs.statSync('smoke-test-data.csv');
  const fileSizeInMegabytes = stats.size / (1024 * 1024);
  console.log(`Successfully generated smoke-test-data.csv with ${totalRows} rows and 10 columns.`);
  console.log(`File size: ${fileSizeInMegabytes.toFixed(2)} MB`);
});
