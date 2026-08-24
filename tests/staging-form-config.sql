select clinic_slug, public_token
from public.clinic_public_forms
where clinic_slug = 'dentalpro'
  and is_active
limit 1;
