import client from './client'

export const getProfile = () => client.get('/profile')
export const updateCookingTimes = (times) => client.put('/profile/cooking-times', times)
export const addFamilyTag = (tag) => client.post('/profile/family-tags', { tag })
export const deleteFamilyTag = (id) => client.delete(`/profile/family-tags/${id}`)
export const addCondiment = (name) => client.post('/profile/condiments', { name })
export const deleteCondiment = (id) => client.delete(`/profile/condiments/${id}`)
export const parseCondimentPhoto = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/profile/condiments/photo', form)
}
export const getMealPlanSettings = () => client.get('/profile/meal-plan-settings')
export const updateMealPlanSettings = (settings) => client.put('/profile/meal-plan-settings', settings)
