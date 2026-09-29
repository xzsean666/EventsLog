class InventoryService {
  Future<bool> reserveStock(String sku, int quantity) async {
    await Future<void>.delayed(const Duration(milliseconds: 15));
    return quantity <= 100;
  }
}
