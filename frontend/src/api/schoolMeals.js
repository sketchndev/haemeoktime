import client from './client'

export const getSchoolMeals = () => client.get('/school-meals')
export const uploadSchoolMealPhoto = (file) => {
  const form = new FormData()
  form.append('file', file)
  return client.post('/school-meals/photo', form)
}
