"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSidebar } from "./SidebarContext";

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export default function Sidebar({ activeSection, setActiveSection }: SidebarProps) {
  const { collapsed, toggleCollapsed } = useSidebar();
  
  return (
    <div className="sidebar z-10 transition-all duration-300 ease-in-out" style={{ width: collapsed ? '70px' : '260px' }} id="sidebar">
      <div className={`py-6 px-4 flex justify-center border-b border-[var(--border)] mb-6 relative ${collapsed ? 'px-2' : ''}`}>
        {collapsed ? (
          <div className="flex items-center justify-center transition-all duration-300 ease-in-out">
            <Image
              src="/nutetra-logo.svg"
              alt="NuTetra Logo"
              width={30}
              height={30}
              priority
              className="opacity-90 hover:opacity-100 transition-all duration-300"
            />
          </div>
        ) : (
          <Image
            src="/nutetra-logo.svg"
            alt="NuTetra Logo"
            width={150}
            height={40}
            priority
            className="opacity-90 hover:opacity-100 transition-all duration-300"
          />
        )}
        
        <button 
          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition-all duration-300"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <svg className="w-4 h-4 transform transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 transform transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>
      
      <nav className={`flex flex-col space-y-1 ${collapsed ? 'px-2' : 'px-3'} transition-all duration-300 overflow-y-auto flex-grow`} style={{ maxHeight: 'calc(100vh - 100px)' }}>
        {!collapsed && (
          <div className="text-xs uppercase text-[var(--text-muted)] px-4 pb-2 mb-2">
            Controls
          </div>
        )}
        
        <Link href="/" 
          className={`sidebar-link ${activeSection === 'dashboard' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('dashboard')}
          title="Dashboard"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Dashboard
          </span>
        </Link>
        
        <Link href="/profiles" 
          className={`sidebar-link ${activeSection === 'profiles' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('profiles')}
          title="Plant Profiles"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Plant Profiles
          </span>
        </Link>
        
        {!collapsed && (
          <div className="text-xs uppercase text-[var(--text-muted)] px-4 pt-4 pb-2 mb-2 mt-2 border-t border-[var(--border)]">
            Automation
          </div>
        )}
        
        {collapsed && (
          <div className="border-t border-[var(--border)] my-2 mx-2"></div>
        )}
        
        <Link href="/nutrients" 
          className={`sidebar-link ${activeSection === 'nutrients' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('nutrients')}
          title="Nutrient Database"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Nutrient Database
          </span>
        </Link>
        
        <Link href="/dosing" 
          className={`sidebar-link ${activeSection === 'dosing' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('dosing')}
          title="Dosing Settings"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Dosing Settings
          </span>
        </Link>
        
        <Link href="/pumps" 
          className={`sidebar-link ${activeSection === 'pumps' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('pumps')}
          title="Pump Control"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Pump Control
          </span>
        </Link>
        
        <Link href="/calibration" 
          className={`sidebar-link ${activeSection === 'calibration' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('calibration')}
          title="Sensor Calibration"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Sensor Calibration
          </span>
        </Link>
        
        {!collapsed && (
          <div className="text-xs uppercase text-[var(--text-muted)] px-4 pt-4 pb-2 mb-2 mt-2 border-t border-[var(--border)]">
            Monitoring
          </div>
        )}
        
        {collapsed && (
          <div className="border-t border-[var(--border)] my-2 mx-2"></div>
        )}
        
        <Link href="/alerts" 
          className={`sidebar-link ${activeSection === 'alerts' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('alerts')}
          title="Alerts"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Alerts
          </span>
        </Link>
        
        <Link href="/logs" 
          className={`sidebar-link ${activeSection === 'logs' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('logs')}
          title="Data Logs"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            Data Logs
          </span>
        </Link>
        
        <div className="mt-auto"></div>
        
        {!collapsed && (
          <div className="text-xs uppercase text-[var(--text-muted)] px-4 pt-4 pb-2 mb-2 mt-4 border-t border-[var(--border)]">
            System
          </div>
        )}
        
        {collapsed && (
          <div className="border-t border-[var(--border)] my-2 mx-2"></div>
        )}
        
        <Link href="/settings" 
          className={`sidebar-link ${activeSection === 'settings' ? 'active' : ''} ${collapsed ? 'justify-center' : ''} transition-all duration-300 ease-in-out`}
          onClick={() => setActiveSection('settings')}
          title="System Settings"
        >
          <svg className={`w-5 h-5 ${collapsed ? 'mx-auto' : 'mr-3'} transition-all duration-300 ease-in-out`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className={`transition-all duration-300 ease-in-out ${collapsed ? 'opacity-0 w-0' : 'opacity-100'}`}>
            System Settings
          </span>
        </Link>
        
        <div className="py-6"></div>
      </nav>
    </div>
  );
} 