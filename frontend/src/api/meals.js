import client from './client'

export const recommendMeals = (body) => client.post('/meals/recommend', body)
export const reRecommendSingle = (body) => client.post('/meals/recommend/single', body)
export const reRecommendMealType = (body) => client.post('/meals/recommend/meal-type', body)
export const deleteHistoryItem = (id) => client.delete(`/meals/history/${id}`)
export const getTodayMeals = () => client.get('/meals/today')
export const getWeekMeals = () => client.get('/meals/week')
