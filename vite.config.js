import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base fixa em /gestao/ pra rodar tanto direto (gestao-three-virid.vercel.app)
// quanto atras do proxy do Painel (painel.nutrialle.com.br/gestao) -- o
// vercel.json mapeia /gestao/assets/* de volta pros arquivos reais em /assets/*
// nos dois casos, entao os hrefs sempre absolutos com esse prefixo funcionam
// nas duas hospedagens (mesmo esquema usado no nutrialle-planos).
// https://vite.dev/config/
export default defineConfig({
  base: '/gestao/',
  plugins: [react()],
})
