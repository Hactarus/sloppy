/** Item icon keys -> emoji. Icon/shape is shown with the colour (colour-blind safe). */
export const ICONS: Record<string, string> = {
  beer: '🍺', beers: '🍻', cola: '🥤', water: '💧', wine: '🍷', coffee: '☕', fries: '🍟', hotdog: '🌭', burger: '🍔', sandwich: '🥪',
  icecream: '🍦', waffle: '🧇', pizza: '🍕', cake: '🍰', tea: '🍵', cocktail: '🍹', merch: '👕', cookie: '🍪', salad: '🥗', soup: '🍲',
}
export const iconFor = (key?: string | null) => (key && ICONS[key]) || '🎟️'
