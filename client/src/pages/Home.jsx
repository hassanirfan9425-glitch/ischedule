import HomeClassic from './HomeClassic.jsx';
import HomeTechnical from './HomeTechnical.jsx';

// Picks which full page implementation to render based on the user's UI style preference —
// not a shared component, two genuinely different page implementations underneath.
export default function Home(props) {
  if (props.user?.uiStyle === 'technical') return <HomeTechnical {...props} />;
  return <HomeClassic {...props} />;
}
