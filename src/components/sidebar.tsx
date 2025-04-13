import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface SidebarProps {
  activePage: string
  className?: string
}

export function Sidebar({ activePage, className }: SidebarProps) {
  const links = [
    { href: '/', label: 'Dashboard', id: 'dashboard' },
    { href: '/sensors', label: 'Sensors', id: 'sensors' },
    { href: '/pumps', label: 'Pumps', id: 'pumps' },
    { href: '/dosing', label: 'Dosing', id: 'dosing' },
    { href: '/profiles', label: 'Profiles', id: 'profiles' },
    { href: '/logs', label: 'Logs', id: 'logs' },
    { href: '/settings', label: 'Settings', id: 'settings' },
  ]

  return (
    <div className={cn("w-64 bg-[#1a1a1a] min-h-screen p-4", className)}>
      <div className="mb-8 pl-2">
        <h1 className="text-xl font-bold text-[#00a3e0]">NuTetra Control</h1>
      </div>
      
      <nav className="space-y-1">
        {links.map((link) => (
          <Link 
            key={link.id}
            href={link.href}
            className={cn(
              "flex items-center py-2 px-4 rounded-md transition-colors",
              activePage === link.id 
                ? "bg-[#00a3e0] text-white" 
                : "text-gray-300 hover:bg-[#282828]"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  )
} 