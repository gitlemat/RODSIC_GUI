from PIL import Image
import os

def remove_background(input_path, output_path, threshold=30):
    try:
        print(f"Processing {input_path}...")
        img = Image.open(input_path)
        img = img.convert("RGBA")
        datas = img.getdata()

        new_data = []
        for item in datas:
            # Check if pixel is dark (black background)
            if item[0] < threshold and item[1] < threshold and item[2] < threshold:
                new_data.append((0, 0, 0, 0)) # Transparent
            else:
                new_data.append(item)

        img.putdata(new_data)
        img.save(output_path, "PNG")
        print(f"Saved transparent image to {output_path}")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(base_dir, "assets")
    
    logo_path = os.path.join(assets_dir, "logo.png")
    favicon_path = os.path.join(assets_dir, "favicon.png")
    
    if os.path.exists(logo_path):
        remove_background(logo_path, logo_path)
    
    if os.path.exists(favicon_path):
        remove_background(favicon_path, favicon_path)
