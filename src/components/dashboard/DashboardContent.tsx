import React, { useState, lazy, Suspense, useEffect, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import PortfolioSummary from "./PortfolioSummary";
import CoinsList from "./CoinsList";
import { User } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { 
  getAllCoins, 
  addCoin, 
  updateCoin, 
  deleteCoin, 
  subscribeToCoinsUpdates, 
  unsubscribeFromCoinsUpdates,
  Coin as CoinType
} from "@/lib/coinService";

interface Transaction {
  id: string;
  coinName: string;
  soldDate: string;
  purchasePrice: number;
  soldPrice: number;
  profit: number;
  profitPercentage: number;
}

const DashboardContent = () => {
  const [activeTab, setActiveTab] = useState("performance");
  const [coins, setCoins] = useState<CoinType[]>([]);
  const [cashReserves, setCashReserves] = useState(50000);
  const [isLoading, setIsLoading] = useState(false);

  // Function to refresh data from the server
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch latest coins from the service
      const latestCoins = await getAllCoins();
      setCoins(latestCoins);
      
      toast({
        title: "Data Refreshed",
        description: "Latest coin data has been loaded",
      });
    } catch (error) {
      console.error("Failed to refresh data:", error);
      toast({
        title: "Refresh Failed",
        description: "Could not load the latest data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize data and set up real-time listeners
  useEffect(() => {
    // Initial data load
    refreshData();
    
    // Set up real-time subscription
    const subscription = subscribeToCoinsUpdates((updatedCoins) => {
      setCoins(updatedCoins);
    });
    
    // Clean up subscription when component unmounts
    return () => {
      unsubscribeFromCoinsUpdates(subscription);
    };
  }, [refreshData]);

  const handleMarkAsSold = async (values: {
    coinId: string;
    is_sold: boolean;
    sold_price?: number;
    sold_date?: string;
  }) => {
    const coinIndex = coins.findIndex(coin => coin.id === values.coinId);
    
    if (coinIndex === -1) {
      toast({
        title: "Error",
        description: "Coin not found",
        variant: "destructive",
      });
      return;
    }
    
    const updatedCoins = [...coins];
    updatedCoins[coinIndex] = {
      ...updatedCoins[coinIndex],
      is_sold: values.is_sold,
      sold_price: values.is_sold ? values.sold_price : undefined,
      sold_date: values.is_sold ? values.sold_date : undefined,
    };
    
    setCoins(updatedCoins);
    
    // Send update to database service
    try {
      await updateCoin(updatedCoins[coinIndex]);
      
      toast({
        title: "Success",
        description: values.is_sold 
          ? `Coin marked as sold for $${values.sold_price}` 
          : "Coin marked as not sold",
      });
    } catch (error) {
      console.error("Failed to update coin:", error);
      toast({
        title: "Update Failed",
        description: "Could not update coin status",
        variant: "destructive",
      });
    }
  };

  const handleNewCoin = async (data: any) => {
    try {
      // Handle image conversion to Base64 if an image file was uploaded
      let imageUrl;
      if (data.image && data.image instanceof File) {
        // Check file size and type
        if (data.image.size > 5 * 1024 * 1024) { // If larger than 5MB
          toast({
            title: "Image too large",
            description: "Please select an image smaller than 5MB",
            variant: "destructive",
          });
          return;
        }
        
        // Convert image to Base64 with compression
        imageUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              // Create canvas for compression
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Calculate new dimensions while maintaining aspect ratio
              const maxDimension = 800;
              if (width > height && width > maxDimension) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else if (height > maxDimension) {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
              
              canvas.width = width;
              canvas.height = height;
              
              // Draw and compress
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              
              // Convert to more efficient format with reduced quality
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
              resolve(compressedDataUrl);
            };
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(data.image);
        });
      } else {
        imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${data.name.replace(/\s+/g, '')}${Date.now()}`;
      }

      const coinData = {
        name: data.name,
        image_url: imageUrl,
        acquisition_date: new Date().toISOString(),
        purchase_price: parseFloat(data.price),
        current_value: parseFloat(data.marketValue),
        roi: 0,
        is_sold: false,
        description: data.description,
        grade: data.grade,
        mint: data.mint,
        year: data.year ? parseInt(data.year) : undefined
      };

      // Add to database and get back the coin with ID
      const newCoin = await addCoin(coinData);
      
      // Update local state
      setCoins(prevCoins => [...prevCoins, newCoin]);
      
      toast({
        title: "Success",
        description: "New coin added to your collection",
      });

      setActiveTab("holdings");
    } catch (error) {
      console.error("Failed to add coin:", error);
      toast({
        title: "Add Failed",
        description: "Could not add the new coin",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCoin = async (coinId: string) => {
    try {
      // Delete from database
      await deleteCoin(coinId);
      
      // Update local state
      setCoins(prevCoins => prevCoins.filter(coin => coin.id !== coinId));
      
      toast({
        title: "Success",
        description: "Coin has been deleted",
      });
    } catch (error) {
      console.error("Failed to delete coin:", error);
      toast({
        title: "Delete Failed",
        description: "Could not delete the coin",
        variant: "destructive",
      });
    }
  };

  const handleUpdateCashReserves = (newAmount: number) => {
    setCashReserves(newAmount);
    toast({
      title: "Success",
      description: `Cash reserves updated to ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(newAmount)}`,
    });
  };

  return (
    <div className="w-full h-full bg-background p-4 md:p-6 lg:p-8">
      <div className="mb-8">
        <PortfolioSummary 
          coins={coins.map(coin => ({
            id: coin.id,
            name: coin.name,
            purchasePrice: coin.purchase_price,
            currentValue: coin.current_value,
            roi: coin.roi,
            isSold: coin.is_sold,
            soldPrice: coin.sold_price,
            soldDate: coin.sold_date ? new Date(coin.sold_date) : undefined
          }))} 
          cashReserves={cashReserves}
          onUpdateCashReserves={handleUpdateCashReserves}
          onRefreshData={refreshData}
        />
      </div>

      <Tabs
        defaultValue="performance"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="mb-6 w-full justify-start overflow-x-auto">
          <TabsTrigger value="performance" className="px-4 py-2">
            Performance
          </TabsTrigger>
          <TabsTrigger value="holdings" className="px-4 py-2">
            Current Holdings
          </TabsTrigger>
          <TabsTrigger value="transactions" className="px-4 py-2">
            Sold Assets
          </TabsTrigger>
          <TabsTrigger value="settings" className="px-4 py-2">
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          <Card className="p-6 bg-card">
            <h2 className="text-2xl font-bold mb-4">Performance Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-80 bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">ROI Chart</p>
              </div>
              <div className="h-80 bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">Historical Value Trends</p>
              </div>
              <div className="h-80 bg-muted rounded-lg flex items-center justify-center md:col-span-2">
                <p className="text-muted-foreground">
                  Market Benchmark Comparison
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="holdings">
          <CoinsList 
            coins={coins.filter(coin => !coin.is_sold)} 
            onDeleteCoin={handleDeleteCoin}
            onMarkAsSold={(coinId, sold_price) => {
              const coinIndex = coins.findIndex(coin => coin.id === coinId);
              if (coinIndex !== -1) {
                const updatedCoins = [...coins];
                updatedCoins[coinIndex] = {
                  ...updatedCoins[coinIndex],
                  is_sold: true,
                  sold_price: sold_price,
                  sold_date: new Date().toISOString(),
                };
                setCoins(updatedCoins);
                toast({
                  title: "Success",
                  description: `Coin marked as sold for $${sold_price}`,
                });
              }
            }}
          />
        </TabsContent>

        <TabsContent value="transactions">
          <CoinsList 
            coins={coins.filter(coin => coin.is_sold)}
            onDeleteCoin={handleDeleteCoin}
          />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card className="p-6 bg-card">
            <h2 className="text-2xl font-bold mb-4">Portfolio Settings</h2>
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Investor Portal</h3>
                <p className="text-muted-foreground">Manage your rare coins collection</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Portfolio Settings</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure how your portfolio is displayed
                </p>
                <div className="h-40 bg-muted/30 rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Settings placeholder
                  </p>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-medium mb-2">Display Preferences</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Customize the dashboard appearance
                </p>
                <div className="h-40 bg-muted/30 rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Preferences placeholder
                  </p>
                </div>
              </div>
              <div className="p-4 border rounded-lg md:col-span-2">
                <h3 className="font-medium mb-2">Notification Preferences</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Manage how you receive updates and alerts
                </p>
                <div className="h-40 bg-muted/30 rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Notification settings placeholder
                  </p>
                </div>
              </div>
              <div className="p-4 border rounded-lg md:col-span-2">
                <h3 className="font-medium mb-2">Upload New Asset</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add a new coin or collectible to your portfolio
                </p>
                <div className="mt-4">
                  {React.createElement(() => {
                    const AssetUploadForm = React.lazy(
                      () => import("@/components/assets/AssetUploadForm"),
                    );
                    return (
                      <React.Suspense fallback={<div>Loading form...</div>}>
                        <AssetUploadForm onSubmit={handleNewCoin} />
                      </React.Suspense>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DashboardContent;
