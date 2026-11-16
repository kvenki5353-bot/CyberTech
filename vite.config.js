import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
	plugins: [react(), tailwindcss()],
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					const modulePath = id.replaceAll('\\', '/')
					if (modulePath.includes('/node_modules/@firebase/firestore/')) return 'firebase-firestore'
					if (modulePath.includes('/node_modules/@firebase/auth/')) return 'firebase-auth'
					if (modulePath.includes('/node_modules/@firebase/database/')) return 'firebase-database'
					if (modulePath.includes('/node_modules/@firebase/')) return 'firebase-core'
					if (modulePath.includes('/node_modules/framer-motion/')) return 'motion'
				},
			},
		},
	},
})