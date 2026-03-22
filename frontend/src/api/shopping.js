import client from './client'

export const getShopping = () => client.get('/shopping')
export const generateShopping = (menus) => client.post('/shopping/generate', { menus })
export const addShoppingItem = (name, quantity, category) =>
  client.post('/shopping/items', { name, quantity, category })
export const checkShoppingItem = (id, isChecked) =>
  client.patch(`/shopping/items/${id}`, { is_checked: isChecked })
export const deleteShoppingItem = (id) => client.delete(`/shopping/items/${id}`)
export const getFrequent = () => client.get('/shopping/frequent')
export const addFrequent = (name) => client.post('/shopping/frequent', { name })
export const deleteFrequent = (id) => client.delete(`/shopping/frequent/${id}`)
