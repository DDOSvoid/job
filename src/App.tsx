import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import JobListPage from './pages/JobListPage'
import CompanyListPage from './pages/CompanyListPage'
import CompanyDetailPage from './pages/CompanyDetailPage'
import JobDetailPage from './pages/JobDetailPage'
import StatsPage from './pages/StatsPage'
import InterviewListPage from './pages/InterviewListPage'
import InterviewDetailPage from './pages/InterviewDetailPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<JobListPage />} />
            <Route path="/companies" element={<CompanyListPage />} />
            <Route path="/companies/:id" element={<CompanyDetailPage />} />
            <Route path="/jobs/:id" element={<JobDetailPage />} />
            <Route path="/interviews" element={<InterviewListPage />} />
            <Route path="/interviews/:id" element={<InterviewDetailPage />} />
            <Route path="/stats" element={<StatsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
