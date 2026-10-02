import { Briefcase, Calendar, CalendarClock, Heart, LifeBuoy, MessageSquare, Package, Shield, Siren, Sparkles, UserSearch, Workflow } from 'lucide-react'

const ICONS = {
  siren: Siren, sparkles: Sparkles, calendar: Calendar, 'calendar-clock': CalendarClock, 'life-buoy': LifeBuoy,
  briefcase: Briefcase, shield: Shield, message: MessageSquare, package: Package, heart: Heart, 'user-search': UserSearch, workflow: Workflow,
} as const

export function FlowIcon({ name, size = 18 }: { name?: string; size?: number }) {
  const Icon = ICONS[(name || 'workflow') as keyof typeof ICONS] || Workflow
  return <Icon size={size} />
}
