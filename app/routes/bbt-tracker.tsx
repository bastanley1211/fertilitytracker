import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, Download, Plus, TrendingUp, AlertCircle, Upload } from 'lucide-react';

const BBTTracker = () => {
  const [temperatures, setTemperatures] = useState([]);
  const [newTemp, setNewTemp] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [fertileWindows, setFertileWindows] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [cervixHeight, setCervixHeight] = useState('');
  const [ovulationStrip, setOvulationStrip] = useState(false);
  const fileInputRef = useRef(null);

  // Load data from memory on component mount
  useEffect(() => {
    const savedData = JSON.parse(localStorage.getItem('bbt-data') || '[]');
    setTemperatures(savedData);
  }, []);

  // Save data to memory whenever temperatures change
  useEffect(() => {
    localStorage.setItem('bbt-data', JSON.stringify(temperatures));
    analyzeFertileWindows();
  }, [temperatures]);

  const addTemperature = () => {
    if (!newTemp || !selectedDate) return;
    
    const temp = parseFloat(newTemp);
    if (isNaN(temp) || temp < 95 || temp > 105) {
      alert('Please enter a valid temperature between 95°F and 105°F');
      return;
    }

    const existingIndex = temperatures.findIndex(t => t.date === selectedDate);
    const newEntry = {
      date: selectedDate,
      temperature: temp,
      cervixHeight: cervixHeight || null,
      ovulationStrip: ovulationStrip,
      dateObj: new Date(selectedDate)
    };

    if (existingIndex >= 0) {
      const updated = [...temperatures];
      updated[existingIndex] = newEntry;
      setTemperatures(updated);
    } else {
      setTemperatures([...temperatures, newEntry].sort((a, b) => new Date(a.date) - new Date(b.date)));
    }

    setNewTemp('');
    setCervixHeight('');
    setOvulationStrip(false);
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const analyzeFertileWindows = () => {
    if (temperatures.length < 14) return;

    const sortedTemps = [...temperatures].sort((a, b) => new Date(a.date) - new Date(b.date));
    const months = {};
    
    // Group temperatures by month
    sortedTemps.forEach(temp => {
      const monthKey = temp.date.substring(0, 7); // YYYY-MM
      if (!months[monthKey]) months[monthKey] = [];
      months[monthKey].push(temp);
    });

    const monthKeys = Object.keys(months).sort();
    const windows = [];

    // Find 7-day periods with highest temperatures for each month with sufficient data
    monthKeys.forEach(monthKey => {
      const monthTemps = months[monthKey];
      if (monthTemps.length >= 14) { // Need at least 14 days of data
        const sevenDayAverages = [];
        
        // Calculate 7-day moving averages
        for (let i = 0; i <= monthTemps.length - 7; i++) {
          const weekTemps = monthTemps.slice(i, i + 7);
          const avgTemp = weekTemps.reduce((sum, t) => sum + t.temperature, 0) / 7;
          sevenDayAverages.push({
            startDate: weekTemps[0].date,
            endDate: weekTemps[6].date,
            avgTemp: avgTemp,
            temperatures: weekTemps
          });
        }

        // Find the week with highest average temperature
        const highestWeek = sevenDayAverages.reduce((max, current) => 
          current.avgTemp > max.avgTemp ? current : max
        );

        windows.push({
          month: monthKey,
          ...highestWeek
        });
      }
    });

    setFertileWindows(windows);

    // Predict next month's fertile window if we have at least 2 months of data
    if (windows.length >= 2) {
      predictNextFertileWindow(windows);
    }
  };

  const predictNextFertileWindow = (windows) => {
    if (windows.length < 2) return;

    const lastTwo = windows.slice(-2);
    const cycleLength1 = calculateCycleLength(lastTwo[0]);
    const cycleLength2 = calculateCycleLength(lastTwo[1]);
    
    const avgCycleLength = (cycleLength1 + cycleLength2) / 2;
    const lastFertileStart = new Date(lastTwo[1].startDate);
    
    // Predict next fertile window based on average cycle length
    const nextFertileStart = new Date(lastFertileStart);
    nextFertileStart.setDate(nextFertileStart.getDate() + avgCycleLength);
    
    const nextFertileEnd = new Date(nextFertileStart);
    nextFertileEnd.setDate(nextFertileEnd.getDate() + 6);

    setPrediction({
      startDate: nextFertileStart.toISOString().split('T')[0],
      endDate: nextFertileEnd.toISOString().split('T')[0],
      cycleLength: Math.round(avgCycleLength)
    });
  };

  const calculateCycleLength = (fertileWindow) => {
    // Estimate cycle length based on when fertile window occurred in the month
    const startDate = new Date(fertileWindow.startDate);
    const dayOfMonth = startDate.getDate();
    
    // Typical ovulation occurs around day 14 of a 28-day cycle
    // Adjust based on when fertile window was detected
    return Math.max(21, Math.min(35, 28 + (dayOfMonth - 14)));
  };

  const importCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target.result;
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        // Find column indices
        const dateIndex = headers.findIndex(h => h.includes('date'));
        const tempIndex = headers.findIndex(h => h.includes('temp'));
        const cervixIndex = headers.findIndex(h => h.includes('cervix') || h.includes('height'));
        const ovulationIndex = headers.findIndex(h => h.includes('ovulation') || h.includes('strip'));
        
        if (dateIndex === -1 || tempIndex === -1) {
          alert('CSV must contain columns with "date" and "temperature" in the headers');
          return;
        }

        const importedData = [];
        const existingDates = new Set(temperatures.map(t => t.date));
        
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i].split(',');
          if (row.length < Math.max(dateIndex, tempIndex) + 1) continue;
          
          const dateStr = row[dateIndex].trim();
          const tempStr = row[tempIndex].trim();
          const cervixStr = cervixIndex >= 0 ? row[cervixIndex]?.trim() : '';
          const ovulationStr = ovulationIndex >= 0 ? row[ovulationIndex]?.trim() : '';
          
          // Parse date - handle various formats
          let date;
          if (dateStr.includes('/')) {
            // Handle MM/DD/YYYY or MM/DD/YY
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              const month = parts[0].padStart(2, '0');
              const day = parts[1].padStart(2, '0');
              let year = parts[2];
              if (year.length === 2) {
                year = '20' + year;
              }
              date = `${year}-${month}-${day}`;
            }
          } else if (dateStr.includes('-')) {
            // Handle YYYY-MM-DD
            date = dateStr;
          } else {
            continue; // Skip invalid date formats
          }

          const temp = parseFloat(tempStr);
          if (isNaN(temp) || temp < 95 || temp > 105) continue;

          // Check if date is valid
          const dateObj = new Date(date);
          if (isNaN(dateObj.getTime())) continue;

          if (!existingDates.has(date)) {
            importedData.push({
              date: date,
              temperature: temp,
              cervixHeight: cervixStr || null,
              ovulationStrip: ovulationStr.toLowerCase() === 'true' || ovulationStr === '1' || ovulationStr.toLowerCase() === 'yes',
              dateObj: dateObj
            });
          }
        }

        if (importedData.length === 0) {
          alert('No valid temperature data found in CSV');
          return;
        }

        // Merge with existing data and sort
        const mergedData = [...temperatures, ...importedData]
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        setTemperatures(mergedData);
        alert(`Successfully imported ${importedData.length} temperature readings`);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        alert('Error reading CSV file. Please check the format and try again.');
        console.error('CSV import error:', error);
      }
    };
    
    reader.readAsText(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const downloadCSV = () => {
    if (temperatures.length === 0) {
      alert('No data to download');
      return;
    }

    const csvContent = [
      ['Date', 'Temperature (°F)', 'Cervix Height', 'Ovulation Strip', 'Fertile Window'],
      ...temperatures.map(temp => {
        const inFertileWindow = fertileWindows.some(fw => 
          temp.date >= fw.startDate && temp.date <= fw.endDate
        );
        return [
          temp.date, 
          temp.temperature, 
          temp.cervixHeight || '', 
          temp.ovulationStrip ? 'Yes' : 'No',
          inFertileWindow ? 'Yes' : 'No'
        ];
      })
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bbt-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatChartData = () => {
    return temperatures.map(temp => ({
      date: temp.date,
      temperature: temp.temperature,
      fertileWindow: fertileWindows.some(fw => 
        temp.date >= fw.startDate && temp.date <= fw.endDate
      ),
      ovulationStrip: temp.ovulationStrip
    }));
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-pink-50 to-purple-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          <TrendingUp className="text-pink-500" />
          Basal Body Temperature Tracker
        </h1>
        <p className="text-gray-600 mb-6">Track your daily basal body temperature to identify fertile windows</p>

        {/* Import/Export Section */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Import/Export Data</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <input
                type="file"
                accept=".csv"
                onChange={importCSV}
                ref={fileInputRef}
                className="hidden"
              />
              <button
                onClick={triggerFileInput}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
              >
                <Upload size={20} />
                Import CSV
              </button>
              <p className="text-sm text-gray-600 mt-1">
                CSV should have columns with "date" and "temperature" headers.<br/>
                Optional: "cervix" or "height" and "ovulation" or "strip" columns.
              </p>
            </div>
            <button
              onClick={downloadCSV}
              disabled={temperatures.length === 0}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
            >
              <Download size={20} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Input Section */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h2 className="text-xl font-semibold text-gray-700 mb-4">Add Temperature Reading</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-40">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°F)</label>
              <input
                type="number"
                step="0.1"
                min="95"
                max="105"
                value={newTemp}
                onChange={(e) => setNewTemp(e.target.value)}
                placeholder="98.6"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cervix Height</label>
              <select
                value={cervixHeight}
                onChange={(e) => setCervixHeight(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              >
                <option value="">Select height</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
            <div className="flex-1 min-w-40">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ovulation Strip</label>
              <div className="flex items-center h-10">
                <input
                  type="checkbox"
                  checked={ovulationStrip}
                  onChange={(e) => setOvulationStrip(e.target.checked)}
                  className="w-4 h-4 text-pink-600 bg-gray-100 border-gray-300 rounded focus:ring-pink-500"
                />
                <label className="ml-2 text-sm text-gray-700">Positive result</label>
              </div>
            </div>
            <button
              onClick={addTemperature}
              className="bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Add Reading
            </button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800">Total Readings</h3>
            <p className="text-2xl font-bold text-blue-600">{temperatures.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-800">Fertile Windows Identified</h3>
            <p className="text-2xl font-bold text-green-600">{fertileWindows.length}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-800">Months Tracked</h3>
            <p className="text-2xl font-bold text-purple-600">
              {new Set(temperatures.map(t => t.date.substring(0, 7))).size}
            </p>
          </div>
        </div>

        {/* Prediction Section */}
        {prediction && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
              <AlertCircle className="text-yellow-600" size={20} />
              Predicted Next Fertile Window
            </h3>
            <p className="text-yellow-700">
              Based on your cycle pattern, your next fertile window is predicted to be from{' '}
              <strong>{formatDate(prediction.startDate)}</strong> to{' '}
              <strong>{formatDate(prediction.endDate)}</strong>
              <br />
              <span className="text-sm">Estimated cycle length: {prediction.cycleLength} days</span>
            </p>
          </div>
        )}

        {/* Fertile Windows Display */}
        {fertileWindows.length > 0 && (
          <div className="bg-pink-50 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-pink-800 mb-3">Identified Fertile Windows</h3>
            <div className="space-y-2">
              {fertileWindows.map((window, index) => (
                <div key={index} className="flex justify-between items-center bg-white rounded p-3">
                  <span className="font-medium text-gray-700">
                    {new Date(window.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <span className="text-pink-600">
                    {formatDate(window.startDate)} - {formatDate(window.endDate)}
                  </span>
                  <span className="text-sm text-gray-500">
                    Avg: {window.avgTemp.toFixed(1)}°F
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart */}
        {temperatures.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Temperature Chart</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formatChartData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatDate}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                  <Tooltip 
                    labelFormatter={(date) => formatDate(date)}
                    formatter={(value, name) => {
                      if (name === 'temperature') return [`${value}°F`, 'Temperature'];
                      return [value, name];
                    }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-3 border border-gray-300 rounded shadow">
                            <p className="font-medium">{formatDate(label)}</p>
                            <p className="text-pink-600">{`Temperature: ${data.temperature}°F`}</p>
                            {data.ovulationStrip && <p className="text-green-600">✓ Positive ovulation strip</p>}
                            {data.fertileWindow && <p className="text-yellow-600">🟡 Fertile window</p>}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="#ec4899" 
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      let fill = "#ec4899"; // Default pink
                      let stroke = "#be185d";
                      
                      if (payload.ovulationStrip) {
                        fill = "#10b981"; // Green for positive ovulation strip
                        stroke = "#059669";
                      } else if (payload.fertileWindow) {
                        fill = "#f59e0b"; // Yellow for fertile window
                        stroke = "#d97706";
                      }
                      
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-gray-600 flex flex-wrap gap-4">
              <span className="inline-flex items-center gap-1">
                <div className="w-3 h-3 bg-pink-500 rounded-full"></div>
                Normal readings
              </span>
              <span className="inline-flex items-center gap-1">
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                Fertile window
              </span>
              <span className="inline-flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                Positive ovulation strip
              </span>
            </div>
          </div>
        )}

        {/* Data Table */}
        {temperatures.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Recent Entries</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-300 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Date</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Temperature</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Cervix Height</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Ovulation Strip</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {temperatures.slice(-10).reverse().map((temp, index) => {
                    const inFertileWindow = fertileWindows.some(fw => 
                      temp.date >= fw.startDate && temp.date <= fw.endDate
                    );
                    return (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2 text-sm text-gray-900">{formatDate(temp.date)}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{temp.temperature}°F</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{temp.cervixHeight || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {temp.ovulationStrip ? (
                            <span className="text-green-600 font-medium">✓ Positive</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {inFertileWindow ? (
                            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs">
                              Fertile Window
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Download Button */}
        <div className="flex justify-end">
          <button
            onClick={downloadCSV}
            disabled={temperatures.length === 0}
            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors"
          >
            <Download size={20} />
            Download CSV
          </button>
        </div>

        {temperatures.length < 14 && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-blue-800 text-sm">
              <strong>Note:</strong> You need at least 14 days of temperature data per month to identify fertile windows. 
              Keep tracking daily for more accurate analysis!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BBTTracker;