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
  
      /* ── HVCO form (placeholder behavior) ── */
      const hvcoBtn = document.querySelector('#hvco button');
      const hvcoInput = document.querySelector('#hvco input[type="email"]');
  
      if (hvcoBtn && hvcoInput) {
        hvcoBtn.addEventListener('click', () => {
          const email = hvcoInput.value.trim();
          if (!email || !email.includes('@')) {
            hvcoInput.style.borderColor = 'rgba(232,69,69,0.6)';
            hvcoInput.placeholder = 'Ingresá un email válido';
            setTimeout(() => {
              hvcoInput.style.borderColor = 'rgba(255,255,255,0.12)';
              hvcoInput.placeholder = 'Tu email para recibir la guía';
            }, 2000);
            return;
          }
          hvcoBtn.textContent = '✓ ¡Guía enviada!';
          hvcoBtn.style.background = 'var(--gold)';
          hvcoInput.value = '';
          hvcoInput.placeholder = 'Revisá tu bandeja de entrada';
          hvcoInput.disabled = true;
          hvcoBtn.disabled = true;
        });
      }