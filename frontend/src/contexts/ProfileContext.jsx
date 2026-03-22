import { createContext, useContext, useEffect, useState } from 'react'
import { getProfile } from '../api/profile'

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState({
    family_tags: [],
    condiments: [],
    cooking_times: { breakfast: 15, lunch: 30, dinner: 40 },
  })
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const data = await getProfile()
      setProfile(data)
    } catch (e) {
      console.error('프로필 로드 실패', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh }}>
      {children}
    </ProfileContext.Provider>
  )
}

export const useProfile = () => useContext(ProfileContext)
