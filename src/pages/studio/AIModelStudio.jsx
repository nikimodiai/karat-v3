import React, { useState } from 'react';
import { Sparkles, PackagePlus } from 'lucide-react';
import { CATEGORIES } from '../../lib/config';
import { useStoreData } from '../../hooks/useStoreData';
import { useToast } from '../../hooks/useToast';
import AIModelPanel from '../../components/AIModelPanel';
import { SuiteFeatureHeader } from '../StudioSuite';
import hub from '../StudioSuite.module.css';
import styles from './AIModelStudio.module.css';

// Map a product category → jewelry_type the workflow understands. Mirrors the
// map inside AIModelPanel so the standalone screen sends a sensible type.
const CATEGORY_TO_JEWELRY_TYPE = {
  Earring: 'earrings', Necklace: 'necklace', Pendant: 'necklace',
  Mangalsutra: 'mangalsutra', Chain: 'necklace', Ring: 'ring',
  Bangle: 'bangles', Bracelet: 'bracelet', Anklet: 'anklet',
  Nosepin: 'nose_pin', 'Maang Tikka': 'maang_tikka', Bajuband: 'armlet',
  Kamarband: 'waist_chain', 'Haath Phool': 'bracelet', Bichhiya: 'anklet',
  Set: 'necklace',
};

/**
 * Standalone AI Model feature (Studio Suite). Reuses the proven AIModelPanel
 * that already lives inside the Add/Edit Product screen — same webhook, chips,
 * lightbox and share. Two differences from the in-product usage:
 *   • a category picker (there's no product to infer the type from), and
 *   • "Add to Images" becomes "Add to Inventory": the generated photo is handed
 *     to the Inventory Add Product screen, pre-populated (via useStoreData's
 *     inventoryPrefill channel + a tab switch), so nothing is duplicated.
 */
export default function AIModelStudio({ onBack, onNavigate }) {
  const { setInventoryPrefill } = useStoreData();
  const { showToast } = useToast();
  const [category, setCategory] = useState('');

  // "Add to Inventory" for a generated image: stash a prefill and jump to the
  // Inventory tab, which opens its Add Product modal pre-filled.
  const addToInventory = (url) => {
    setInventoryPrefill({
      imageUrl: url,
      category: category || '',
      // AI-model output is a styled model photo, not a spec'd design, so we only
      // seed what we actually know: the image and the chosen category.
    });
    showToast('Opening Add Product with your AI model photo…', '#1D4ED8');
    onNavigate?.('inventory');
  };

  return (
    <div className={hub.page}>
      <SuiteFeatureHeader
        onBack={onBack}
        icon={Sparkles}
        title="AI Model"
        sub="Put your jewellery on a photorealistic model, then add the shot straight to your inventory."
      />

      {/* Category — AIModelPanel needs it to place the piece correctly. */}
      <div className={styles.catBlock}>
        <label className={styles.catLabel}>Jewellery category</label>
        <select
          className={styles.catSelect}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Auto (let AI decide)</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label || c.value}</option>
          ))}
        </select>
        <p className={styles.catHint}>
          <PackagePlus size={13} /> After generating, use <b>Add to Inventory</b> on any photo to create a product with it.
        </p>
      </div>

      {/* The proven panel. `onAddImage` here means "add to inventory". */}
      <AIModelPanel category={category} onAddImage={addToInventory} addLabel="Add to Inventory" />
    </div>
  );
}
