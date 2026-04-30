    /* ── Reveal on scroll ── */
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1 });
      document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  
      /* ── Sticky WhatsApp: aparece después del 40% de scroll ── */
      const stickyBtn = document.getElementById('stickyBtn');
      const showThreshold = 0.4;
      let heroHeight = 0;
  
      function updateStickyVisibility() {
        const scrolled = window.scrollY / (document.body.scrollHeight - window.innerHeight);
        if (scrolled > showThreshold) {
          stickyBtn.classList.add('show');
        } else {
          stickyBtn.classList.remove('show');
        }
      }
  
      window.addEventListener('scroll', updateStickyVisibility, { passive: true });