"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { useSidebar } from "../components/SidebarContext";
import { useAlertData } from "../hooks/useAlertData";

export default function AlertsPage() {
  const [activeSection, setActiveSection] = useState("alerts");
  const { collapsed } = useSidebar();
  const { 
    data: alertData, 
    isLoading, 
    error, 
    refresh,
    acknowledgeAlert,
    resolveAlert,
    updateSettings,
    updateThresholds
  } = useAlertData({ refreshInterval: 10000 });
  
  const [activeTab, setActiveTab] = useState("current");
  const [editingSettings, setEditingSettings] = useState(false);
  const [editingThresholds, setEditingThresholds] = useState(false);

  // Form state for alert settings
  const [formSettings, setFormSettings] = useState({
    email: '',
    smsNumber: '',
    notifyOnCritical: true,
    notifyOnWarning: true,
    notifyOnInfo: false,
    dailySummary: true
  });

  // Form state for threshold settings
  const [formThresholds, setFormThresholds] = useState({
    ph: { min: 5.8, max: 6.2, criticalMin: 5.5, criticalMax: 6.5 },
    ec: { min: 1.2, max: 1.5, criticalMin: 1.0, criticalMax: 1.8 },
    temp: { min: 20, max: 24, criticalMin: 18, criticalMax: 26 }
  });

  // When alertData changes, update the form values
  useEffect(() => {
    if (alertData) {
      if (alertData.alertSettings) {
        setFormSettings({
          email: alertData.alertSettings.email || '',
          smsNumber: alertData.alertSettings.smsNumber || '',
          notifyOnCritical: alertData.alertSettings.notifyOnCritical ?? true,
          notifyOnWarning: alertData.alertSettings.notifyOnWarning ?? true,
          notifyOnInfo: alertData.alertSettings.notifyOnInfo ?? false,
          dailySummary: alertData.alertSettings.dailySummary ?? true
        });
      }
      
      if (alertData.thresholdSettings) {
        setFormThresholds({
          ph: { 
            min: alertData.thresholdSettings.ph.min, 
            max: alertData.thresholdSettings.ph.max,
            criticalMin: alertData.thresholdSettings.ph.criticalMin,
            criticalMax: alertData.thresholdSettings.ph.criticalMax
          },
          ec: { 
            min: alertData.thresholdSettings.ec.min, 
            max: alertData.thresholdSettings.ec.max,
            criticalMin: alertData.thresholdSettings.ec.criticalMin,
            criticalMax: alertData.thresholdSettings.ec.criticalMax
          },
          temp: { 
            min: alertData.thresholdSettings.temp.min, 
            max: alertData.thresholdSettings.temp.max,
            criticalMin: alertData.thresholdSettings.temp.criticalMin,
            criticalMax: alertData.thresholdSettings.temp.criticalMax
          }
        });
      }
    }
  }, [alertData]);

  const getUnacknowledgedCount = () => {
    if (!alertData || !alertData.activeAlerts) return 0;
    return alertData.activeAlerts.filter(a => !a.acknowledged).length;
  };

  const handleSaveSettings = async () => {
    try {
      await updateSettings(formSettings);
      setEditingSettings(false);
    } catch (error) {
      console.error('Failed to save alert settings:', error);
    }
  };

  const handleSaveThresholds = async () => {
    try {
      await updateThresholds(formThresholds);
      setEditingThresholds(false);
    } catch (error) {
      console.error('Failed to save threshold settings:', error);
    }
  };

  const handleClearAlert = (alertId: number) => {
    resolveAlert(alertId);
  };

  return (
    <div className="flex h-screen bg-[#121212]">
      {/* Sidebar */}
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

      {/* Main Content */}
      <div className={`main-content p-8 ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Alerts</h1>
            {getUnacknowledgedCount() > 0 && (
              <span className="text-red-400 text-sm font-medium">
                {getUnacknowledgedCount()} unacknowledged alert(s)
              </span>
            )}
          </div>
          <button 
            className="btn flex items-center"
            onClick={refresh}
            disabled={isLoading}
          >
            <svg className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-[#333333]">
          <div className="flex">
            <button 
              className={`px-4 py-2 font-medium text-sm ${activeTab === 'current' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('current')}
            >
              Current Alerts
            </button>
            <button 
              className={`px-4 py-2 font-medium text-sm ${activeTab === 'history' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('history')}
            >
              Alert History
            </button>
            <button 
              className={`px-4 py-2 font-medium text-sm ${activeTab === 'settings' ? 'border-b-2 border-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && !alertData && (
          <div className="card">
            <div className="animate-pulse text-center py-12">
              <p>Loading alert data...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-md p-4 mb-8 text-red-200">
            <div className="flex items-start">
              <svg className="w-6 h-6 mr-2 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-lg font-semibold">Error Loading Alerts</h3>
                <p>{error.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Current Alerts Tab */}
        {activeTab === 'current' && alertData && (
          <div className="card">
            <h2 className="card-title mb-4">Active Alerts</h2>
            
            {alertData.activeAlerts && alertData.activeAlerts.length > 0 ? (
              <div className="space-y-4">
                {alertData.activeAlerts.map((alert) => (
                  <div key={alert.id} className="bg-[#1a1a1a] p-4 rounded border border-[#333333]">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center mb-1">
                          <span 
                            className={`h-2 w-2 rounded-full mr-2 ${
                              alert.severity === 'critical' ? 'bg-red-500' : 
                              alert.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                            }`}
                          ></span>
                          <h3 className="font-medium">{alert.title}</h3>
                          <span className={`rounded-full px-2 py-1 text-xs ml-2 ${alert.acknowledged ? 'bg-yellow-800 text-yellow-100' : 'bg-red-800 text-red-100'}`}>
                            {alert.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
                          </span>
                        </div>
                        <p className="text-gray-400 text-sm">{alert.message}</p>
                      </div>
                      <div className="flex space-x-2">
                        {!alert.acknowledged && (
                          <button 
                            className="btn btn-small btn-secondary"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            Acknowledge
                          </button>
                        )}
                        <button 
                          className="btn btn-small btn-danger"
                          onClick={() => handleClearAlert(alert.id)}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      <span>{new Date(alert.timestamp).toLocaleString()}</span>
                      {alert.sensor && (
                        <span className="ml-2 text-gray-400">Sensor: {alert.sensor}</span>
                      )}
                      {alert.value && (
                        <span className="ml-2 text-gray-400">Value: {alert.value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No active alerts at this time</p>
                <p className="text-sm mt-1">The system is operating normally</p>
              </div>
            )}
          </div>
        )}

        {/* Alert History Tab */}
        {activeTab === 'history' && alertData && (
          <div className="card">
            <h2 className="card-title mb-4">Alert History</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#333333]">
                    <th className="pb-2 text-left font-medium text-sm text-gray-400">Time</th>
                    <th className="pb-2 text-left font-medium text-sm text-gray-400">Alert</th>
                    <th className="pb-2 text-left font-medium text-sm text-gray-400">Severity</th>
                    <th className="pb-2 text-left font-medium text-sm text-gray-400">Sensor</th>
                    <th className="pb-2 text-left font-medium text-sm text-gray-400">Value</th>
                    <th className="pb-2 text-left font-medium text-sm text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {alertData.recentAlerts && alertData.recentAlerts.map((alert) => (
                    <tr key={alert.id} className="border-b border-[#333333]">
                      <td className="py-3 text-sm">{new Date(alert.timestamp).toLocaleString()}</td>
                      <td className="py-3">{alert.title}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          alert.severity === 'critical' ? 'bg-red-900/50 text-red-200' : 
                          alert.severity === 'warning' ? 'bg-yellow-900/50 text-yellow-200' : 
                          'bg-blue-900/50 text-blue-200'
                        }`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="py-3 text-sm">{alert.sensor || '-'}</td>
                      <td className="py-3 text-sm">{alert.value || '-'}</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          alert.resolved ? 'bg-green-900/50 text-green-200' : 
                          alert.acknowledged ? 'bg-yellow-900/50 text-yellow-200' : 
                          'bg-red-900/50 text-red-200'
                        }`}>
                          {alert.resolved ? 'Resolved' : (alert.acknowledged ? 'Acknowledged' : 'Unacknowledged')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {(!alertData.recentAlerts || alertData.recentAlerts.length === 0) && (
                <div className="text-center py-8 text-gray-400">
                  <p>No alert history available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && alertData && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Alert Notification Settings */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="card-title">Notification Settings</h2>
                {editingSettings ? (
                  <div className="space-x-2">
                    <button 
                      className="btn btn-small btn-secondary"
                      onClick={() => setEditingSettings(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn btn-small"
                      onClick={handleSaveSettings}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button 
                    className="btn btn-small"
                    onClick={() => setEditingSettings(true)}
                  >
                    Edit
                  </button>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2">Email Notifications</label>
                  {editingSettings ? (
                    <input 
                      type="email" 
                      className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                      value={formSettings.email}
                      onChange={(e) => setFormSettings({...formSettings, email: e.target.value})}
                      placeholder="Enter email address"
                    />
                  ) : (
                    <div className="bg-[#1a1a1a] p-2 rounded">
                      {formSettings.email || 'Not set'}
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm mb-2">SMS Notifications</label>
                  {editingSettings ? (
                    <input 
                      type="tel" 
                      className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                      value={formSettings.smsNumber}
                      onChange={(e) => setFormSettings({...formSettings, smsNumber: e.target.value})}
                      placeholder="Enter phone number"
                    />
                  ) : (
                    <div className="bg-[#1a1a1a] p-2 rounded">
                      {formSettings.smsNumber || 'Not set'}
                    </div>
                  )}
                </div>
                
                <div className="border-t border-[#333333] pt-4">
                  <h3 className="text-sm font-medium mb-3">Notification Types</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        id="notifyCritical" 
                        className="mr-2"
                        checked={formSettings.notifyOnCritical}
                        onChange={(e) => setFormSettings({...formSettings, notifyOnCritical: e.target.checked})}
                        disabled={!editingSettings}
                      />
                      <label htmlFor="notifyCritical">Critical Alerts</label>
                    </div>
                    
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        id="notifyWarning" 
                        className="mr-2"
                        checked={formSettings.notifyOnWarning}
                        onChange={(e) => setFormSettings({...formSettings, notifyOnWarning: e.target.checked})}
                        disabled={!editingSettings}
                      />
                      <label htmlFor="notifyWarning">Warning Alerts</label>
                    </div>
                    
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        id="notifyInfo" 
                        className="mr-2"
                        checked={formSettings.notifyOnInfo}
                        onChange={(e) => setFormSettings({...formSettings, notifyOnInfo: e.target.checked})}
                        disabled={!editingSettings}
                      />
                      <label htmlFor="notifyInfo">Informational Alerts</label>
                    </div>
                    
                    <div className="flex items-center">
                      <input 
                        type="checkbox" 
                        id="dailySummary" 
                        className="mr-2"
                        checked={formSettings.dailySummary}
                        onChange={(e) => setFormSettings({...formSettings, dailySummary: e.target.checked})}
                        disabled={!editingSettings}
                      />
                      <label htmlFor="dailySummary">Daily Summary</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Alert Thresholds */}
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="card-title">Alert Thresholds</h2>
                {editingThresholds ? (
                  <div className="space-x-2">
                    <button 
                      className="btn btn-small btn-secondary"
                      onClick={() => setEditingThresholds(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn btn-small"
                      onClick={handleSaveThresholds}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button 
                    className="btn btn-small"
                    onClick={() => setEditingThresholds(true)}
                  >
                    Edit
                  </button>
                )}
              </div>
              
              <div className="space-y-6">
                {/* pH Thresholds */}
                <div>
                  <h3 className="text-sm font-medium mb-3">pH Thresholds</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1">Warning Min</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ph.min}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ph: {...formThresholds.ph, min: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ph.min}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Warning Max</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ph.max}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ph: {...formThresholds.ph, max: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ph.max}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Critical Min</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ph.criticalMin}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ph: {...formThresholds.ph, criticalMin: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ph.criticalMin}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Critical Max</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ph.criticalMax}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ph: {...formThresholds.ph, criticalMax: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ph.criticalMax}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* EC Thresholds */}
                <div>
                  <h3 className="text-sm font-medium mb-3">EC Thresholds (mS/cm)</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1">Warning Min</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ec.min}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ec: {...formThresholds.ec, min: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ec.min}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Warning Max</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ec.max}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ec: {...formThresholds.ec, max: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ec.max}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Critical Min</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ec.criticalMin}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ec: {...formThresholds.ec, criticalMin: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ec.criticalMin}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Critical Max</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.ec.criticalMax}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            ec: {...formThresholds.ec, criticalMax: parseFloat(e.target.value)}
                          })}
                          step="0.1"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.ec.criticalMax}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Temperature Thresholds */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Temperature Thresholds (°C)</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1">Warning Min</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.temp.min}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            temp: {...formThresholds.temp, min: parseFloat(e.target.value)}
                          })}
                          step="0.5"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.temp.min}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Warning Max</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.temp.max}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            temp: {...formThresholds.temp, max: parseFloat(e.target.value)}
                          })}
                          step="0.5"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.temp.max}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Critical Min</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.temp.criticalMin}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            temp: {...formThresholds.temp, criticalMin: parseFloat(e.target.value)}
                          })}
                          step="0.5"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.temp.criticalMin}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs mb-1">Critical Max</label>
                      {editingThresholds ? (
                        <input 
                          type="number" 
                          className="w-full bg-[#1e1e1e] border border-[#333333] rounded p-2"
                          value={formThresholds.temp.criticalMax}
                          onChange={(e) => setFormThresholds({
                            ...formThresholds, 
                            temp: {...formThresholds.temp, criticalMax: parseFloat(e.target.value)}
                          })}
                          step="0.5"
                        />
                      ) : (
                        <div className="bg-[#1a1a1a] p-2 rounded">
                          {formThresholds.temp.criticalMax}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 