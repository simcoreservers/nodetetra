"use client";

import { useState } from 'react';
import { MdAccessTime, MdDeleteOutline, MdFileDownload } from 'react-icons/md';
import { BiFilter } from 'react-icons/bi';
import { BsArrowsFullscreen, BsFullscreenExit } from 'react-icons/bs';
import { 
  Card, CardContent, CardHeader, CardTitle, 
  CardDescription, CardFooter 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, TableHeader, TableRow, TableHead, 
  TableBody, TableCell 
} from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { SectionHeader } from '@/components/ui/section-header';
import { Pagination } from '@/components/ui/pagination';
import Sidebar from '@/app/components/Sidebar';
import { useLogData } from '@/app/hooks/useLogData';
import { useSidebar } from '@/app/components/SidebarContext';

export default function LogsPage() {
  const [activeSection, setActiveSection] = useState("logs");
  const [activeTab, setActiveTab] = useState("logs");
  const [timeRange, setTimeRange] = useState('24h');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const { collapsed } = useSidebar();
  
  const {
    data,
    isLoading,
    error,
    exportData,
    generateReport,
    pagination
  } = useLogData({
    timeRange,
    page,
    pageSize,
    refreshInterval: 60000 // Refresh every minute
  });

  const logs = data?.logs || [];
  const chartData = data?.chartData || { ph: [], ec: [], waterTemp: [], timestamps: [] };
  
  const handleExport = async () => {
    await exportData('csv');
  };
  
  const handleGenerateReport = async () => {
    const result = await generateReport();
    // Display success message or handle the response
    console.log("Report generated:", result);
  };

  return (
    <div className="flex h-screen bg-[var(--background)]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <SectionHeader 
          title="System Logs" 
          description="Review historical data and generate reports"
          actions={
            <div className="flex space-x-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="6h">Last 6 Hours</SelectItem>
                  <SelectItem value="24h">Last 24 Hours</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="outline" onClick={handleExport}>
                <MdFileDownload className="mr-2" /> Export
              </Button>
            </div>
          }
        />
        
        <Tabs defaultValue="logs" value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="logs">Latest Logs</TabsTrigger>
            <TabsTrigger value="charts">Charts</TabsTrigger>
          </TabsList>
          
          <TabsContent value="logs" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle>System Activity</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm">
                      <BiFilter className="mr-2" /> Filter
                    </Button>
                    <Button variant="outline" size="sm">
                      <MdDeleteOutline className="mr-2" /> Clear
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  {isLoading ? 'Loading logs...' : 
                   error ? `Error loading logs: ${error.message}` : 
                   `Showing ${logs.length} of ${pagination.totalCount} entries`}
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>pH</TableHead>
                      <TableHead>EC</TableHead>
                      <TableHead>Water Temp</TableHead>
                      <TableHead>Pump Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">Loading...</TableCell>
                      </TableRow>
                    ) : error ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-red-500">
                          Error loading data: {error.message}
                        </TableCell>
                      </TableRow>
                    ) : logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">No logs available</TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{log.timestamp}</TableCell>
                          <TableCell>{log.ph}</TableCell>
                          <TableCell>{log.ec}</TableCell>
                          <TableCell>{log.waterTemp}°C</TableCell>
                          <TableCell>{log.pumpActivity}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
              
              <CardFooter>
                <Pagination 
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                />
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Generate Reports</CardTitle>
                <CardDescription>Create detailed reports for specific time periods</CardDescription>
              </CardHeader>
              <CardContent className="flex space-x-4">
                <Button variant="outline" onClick={handleGenerateReport}>
                  24-Hour Report
                </Button>
                <Button variant="outline" onClick={handleGenerateReport}>
                  Weekly Report
                </Button>
                <Button variant="outline" onClick={handleGenerateReport}>
                  Monthly Report
                </Button>
                <Button variant="outline" onClick={handleGenerateReport}>
                  Custom Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="charts" className="space-y-4 mt-4">
            <Card className={chartFullscreen ? "fixed inset-0 z-50 overflow-auto bg-background" : ""}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle>Sensor Readings Over Time</CardTitle>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setChartFullscreen(!chartFullscreen)}
                  >
                    {chartFullscreen ? <BsFullscreenExit /> : <BsArrowsFullscreen />}
                  </Button>
                </div>
                <CardDescription>
                  {timeRange === '24h' ? 'Last 24 Hours' : 
                   timeRange === '7d' ? 'Last 7 Days' : 
                   timeRange === '30d' ? 'Last 30 Days' : 'Custom Period'}
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className={`w-full ${chartFullscreen ? "h-[80vh]" : "h-[400px]"}`}>
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      Loading chart data...
                    </div>
                  ) : error ? (
                    <div className="flex items-center justify-center h-full text-red-500">
                      Error loading chart data: {error.message}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={Array.from({ length: chartData.ph.length }).map((_, i) => ({
                          name: chartData.timestamps?.[i] || i.toString(),
                          pH: chartData.ph[i] || 0,
                          EC: chartData.ec[i] || 0,
                          temp: chartData.waterTemp[i] || 0
                        }))}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip 
                          formatter={(value) => [value, '']}
                          labelFormatter={(label) => `Time: ${label}`}
                        />
                        <Legend />
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="pH" 
                          stroke="#8884d8" 
                          activeDot={{ r: 8 }} 
                        />
                        <Line 
                          yAxisId="right"
                          type="monotone" 
                          dataKey="EC" 
                          stroke="#82ca9d" 
                        />
                        <Line 
                          yAxisId="left"
                          type="monotone" 
                          dataKey="temp" 
                          stroke="#ffc658" 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 