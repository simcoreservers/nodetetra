import React from 'react'
import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

export function SectionHeader({ 
  title, 
  description, 
  actions,
  className 
}: SectionHeaderProps) {
  return (
    <div className={cn("flex justify-between items-start mb-6", className)}>
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="text-gray-400 mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center">
          {actions}
        </div>
      )}
    </div>
  )
} 