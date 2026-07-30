Rails.application.config.session_store :cookie_store,
  key: '_pharmacy_session',
  domain: '.onrender.com',
  same_site: :none,
  secure: true