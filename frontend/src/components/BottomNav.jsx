import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: '식단', icon: '🍽' },
  { to: '/shopping', label: '장보기', icon: '🛒' },
  { to: '/recipes', label: '레시피', icon: '📖' },
  { to: '/settings', label: '설정', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex max-w-[430px] mx-auto">
      {tabs.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 text-xs ${
              isActive ? 'text-green-600 font-semibold' : 'text-gray-500'
            }`
          }
        >
          <span className="text-xl">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
