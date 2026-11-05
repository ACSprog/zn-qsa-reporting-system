/**
 * Zambia Airways (2014) Limited
 * Safety Reporting System - Multi-Portal Architecture
 *
 * Front-end Website URLs:
 * - Public Safety Reporting Home: / or /report
 * - Hazard Report Form: /hazard
 * - Incident Report Form: /incident
 * - Accident Report Form: /accident
 * - Safety Concern Form: /concern
 *
 * CMS Backend Portal URL:
 * - QSA CMS Console: /cms (also supports /admin, /qsa)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FormType } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { FormPage } from './pages/FormPage';
import { QsaCmsPortal } from './pages/QsaCmsPortal';
import { AuthActionPage } from './pages/AuthActionPage';

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'form' | 'cms' | 'auth'>('home');
  const [selectedForm, setSelectedForm] = useState<FormType>('hazard');

  // Parse path, query parameters, and hash to support distinct URLs
  const syncRouteFromUrl = useCallback(() => {
    const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
    const searchParams = new URLSearchParams(window.location.search);

    const portalParam = searchParams.get('portal')?.toLowerCase() || searchParams.get('page')?.toLowerCase();
    const formParam = searchParams.get('form')?.toLowerCase() || searchParams.get('report')?.toLowerCase();

    // 0. Links from Firebase emails (password reset, email verification)
    if (path === '/auth/action') {
      setCurrentView('auth');
      return;
    }

    // 1. Check for CMS Portal routes (/cms, /admin, /qsa)
    if (
      path === '/cms' ||
      path === '/admin' ||
      path === '/qsa' ||
      path === '/qsa-portal' ||
      hash === 'cms' ||
      hash === 'admin' ||
      hash === 'qsa' ||
      portalParam === 'cms' ||
      portalParam === 'admin'
    ) {
      setCurrentView('cms');
      return;
    }

    // 2. Check for Direct Form routes (/hazard, /incident, /accident, /concern)
    const formRoutes: Record<string, FormType> = {
      '/hazard': 'hazard',
      '/report/hazard': 'hazard',
      '/incident': 'incident',
      '/report/incident': 'incident',
      '/accident': 'accident',
      '/report/accident': 'accident',
      '/concern': 'concern',
      '/report/concern': 'concern'
    };

    if (formRoutes[path]) {
      setSelectedForm(formRoutes[path]);
      setCurrentView('form');
      return;
    }

    // Check query params (?form=hazard)
    if (formParam && ['hazard', 'incident', 'accident', 'concern'].includes(formParam)) {
      setSelectedForm(formParam as FormType);
      setCurrentView('form');
      return;
    }

    // Check hash (#hazard)
    if (hash && ['hazard', 'incident', 'accident', 'concern'].includes(hash)) {
      setSelectedForm(hash as FormType);
      setCurrentView('form');
      return;
    }

    // 3. Default: Public Reporting Home
    setCurrentView('home');
  }, []);

  useEffect(() => {
    syncRouteFromUrl();
    window.addEventListener('popstate', syncRouteFromUrl);
    return () => window.removeEventListener('popstate', syncRouteFromUrl);
  }, [syncRouteFromUrl]);

  // Navigation Handlers with proper browser URL updates
  const navigateToHome = () => {
    setCurrentView('home');
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToForm = (form: FormType) => {
    setSelectedForm(form);
    setCurrentView('form');
    window.history.pushState({}, '', `/${form}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToCms = () => {
    setCurrentView('cms');
    window.history.pushState({}, '', '/cms');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Branded page for links in Firebase emails
  if (currentView === 'auth') {
    return (
      <AuthActionPage
        onGoToCms={() => {
          window.history.replaceState({}, '', '/admin');
          setCurrentView('cms');
        }}
        onGoHome={() => {
          window.history.replaceState({}, '', '/');
          setCurrentView('home');
        }}
      />
    );
  }

  // If in CMS view, render the dedicated QSA CMS Console
  if (currentView === 'cms') {
    return (
      <QsaCmsPortal
        onNavigatePublicSite={navigateToHome}
        onNavigatePublicForm={navigateToForm}
      />
    );
  }

  // Otherwise, render the Public Safety Reporting Site
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900 selection:bg-[#1B8E44] selection:text-white">
      {/* Clean Public Header */}
      <Header
        currentView={currentView}
        selectedForm={selectedForm}
        onNavigateHome={navigateToHome}
        onSelectForm={navigateToForm}
      />

      {/* Main Public Content */}
      <main className="flex-1">
        {currentView === 'home' && (
          <HomePage onSelectForm={navigateToForm} />
        )}

        {currentView === 'form' && (
          <FormPage
            form={selectedForm}
            onGoHome={navigateToHome}
            onSelectForm={navigateToForm}
          />
        )}
      </main>

      {/* Pure Corporate Airline Footer */}
      <Footer />
    </div>
  );
}
