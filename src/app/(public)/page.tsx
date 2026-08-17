import { redirect } from 'next/navigation'

// This deployment is the studio's internal staff tool; the public marketing site lives elsewhere.
// Opening the app goes straight to the staff workspace (which sends you to sign in if needed).
export default function HomePage() {
  redirect('/projects')
}
