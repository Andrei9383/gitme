import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className = '', ...props }, ref) => (
    <TabsPrimitive.List
        ref={ref}
        className={`inline-flex h-9 items-center justify-center rounded-md border border-black/10 dark:border-white/10 bg-transparent p-1 text-sm ${className}`}
        {...props}
    />
))
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className = '', ...props }, ref) => (
    <TabsPrimitive.Trigger
        ref={ref}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors data-[state=active]:bg-black data-[state=active]:text-[#f2dfb2] dark:data-[state=active]:bg-white dark:data-[state=active]:text-gray-900 hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 ${className}`}
        {...props}
    />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
    React.ElementRef<typeof TabsPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className = '', ...props }, ref) => (
    <TabsPrimitive.Content
        ref={ref}
        className={`focus-visible:outline-none ${className}`}
        {...props}
    />
))
TabsContent.displayName = TabsPrimitive.Content.displayName
